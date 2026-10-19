// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IChogTraits} from "../interfaces/IChog.sol";
import {ChogText} from "./ChogText.sol";

/// @title ChogArt
/// @notice Builds the fully on-chain SVG of a "living" Chog.
/// @dev Layers, back to front:
///  1. background gradient picked by the Background trait, tinted by the mood accent colour;
///  2. a pulsing aura + rotating dashed ring while a boost is active;
///  3. the character: body colour by the Body trait, eye style by the Eyes trait, and brows, lids,
///     mouth and extras (sparkles, sparks, Zzz, flexed arms) by mood;
///  4. a HUD: token number, mood badge, boost badge and a caption with the last message and lifetime yield.
/// Gradient ids are suffixed with the token id so several SVGs can be inlined in one page.
/// A dormant Chog (no Daemon account, or the account does not answer) is drawn greyed out and asleep.
library ChogArt {
    /// @notice Everything the renderer needs. Text fields are raw (sanitised, not escaped); escaping happens here.
    struct Params {
        uint256 tokenId;
        IChogTraits.Traits traits;
        bool awake; // Daemon account exists and reported a valid mood
        uint8 mood; // IDaemonAccount.Mood, only meaningful when awake
        bool boosted; // boost multiplier > 1x and not expired
        uint256 boostBps; // effective multiplier in bps
        string yieldText; // formatted lifetime yield, e.g. "12.34"
        string message; // sanitised caption text
    }

    uint8 internal constant MOOD_CHILL = 0;
    uint8 internal constant MOOD_SMUG = 1;
    uint8 internal constant MOOD_CHAOTIC = 2;
    uint8 internal constant MOOD_FLEXING = 3;
    uint8 internal constant MOOD_TIRED = 4;

    string private constant INK = "#2B1B3D";

    // ------------------------------------------------------------------
    // Names (shared with the JSON metadata)
    // ------------------------------------------------------------------

    /// @notice Name of a Background trait value.
    function backgroundName(uint8 v) internal pure returns (string memory) {
        return _pick(v, "Lavender", "Mint", "Sunset", "Ocean", "Midnight");
    }

    /// @notice Name of a Body trait value.
    function bodyName(uint8 v) internal pure returns (string memory) {
        return _pick(v, "Monad Purple", "Bubblegum", "Teal", "Gold", "Shadow");
    }

    /// @notice Name of an Eyes trait value.
    function eyesName(uint8 v) internal pure returns (string memory) {
        return _pick(v, "Dot", "Big", "Glow", "Shades", "Button");
    }

    /// @notice Name of a Vibe trait value.
    function vibeName(uint8 v) internal pure returns (string memory) {
        return _pick(v, "Calm", "Cocky", "Wild", "Flashy", "Sleepy");
    }

    /// @notice Name of a mood (IDaemonAccount.Mood order).
    function moodName(uint8 v) internal pure returns (string memory) {
        return _pick(v, "Chill", "Smug", "Chaotic", "Flexing", "Tired");
    }

    // ------------------------------------------------------------------
    // Entry point
    // ------------------------------------------------------------------

    /// @notice Renders the complete SVG document.
    /// @dev External so the SVG code lives in the deployed library, keeping MockChog well under EIP-170.
    /// Forge scripts and tests link it automatically; `forge create` needs `--libraries`.
    function render(Params memory p) external pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" font-family="monospace">',
            _defs(p),
            _background(p),
            p.boosted ? _aura(p) : "",
            _character(p),
            _hud(p),
            "</svg>"
        );
    }

    // ------------------------------------------------------------------
    // Layers
    // ------------------------------------------------------------------

    function _defs(Params memory p) private pure returns (string memory) {
        uint8 b = p.traits.background;
        string memory top = _pick(b, "#EDE9FE", "#D1FAE5", "#FED7AA", "#BAE6FD", "#312E81");
        string memory bottom = _pick(b, "#C4B5FD", "#6EE7B7", "#FB7185", "#3B82F6", "#0F172A");
        string memory id = Strings.toString(p.tokenId);
        string memory grad = string.concat(
            '<defs><linearGradient id="bg', id, '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="',
            top,
            '"/><stop offset="1" stop-color="',
            bottom,
            '"/></linearGradient>'
        );
        return string.concat(
            grad,
            '<radialGradient id="aura', id, '"><stop offset="0.55" stop-color="',
            _accent(p),
            '" stop-opacity="0.85"/><stop offset="1" stop-color="',
            _accent(p),
            '" stop-opacity="0"/></radialGradient></defs>'
        );
    }

    function _background(Params memory p) private pure returns (string memory) {
        string memory pattern = p.traits.background == 4
            ? '<g fill="#FFF"><circle cx="40" cy="50" r="2"/><circle cx="350" cy="40" r="1.5"/><circle cx="90" cy="120" r="1"/><circle cx="320" cy="140" r="2"/><circle cx="360" cy="250" r="1"/><circle cx="30" cy="230" r="1.5"/></g>'
            : '<g fill="#FFF" opacity="0.35"><circle cx="50" cy="70" r="18"/><circle cx="345" cy="95" r="26"/><circle cx="330" cy="290" r="12"/><circle cx="60" cy="280" r="9"/></g>';
        return string.concat(
            '<rect width="400" height="400" fill="url(#bg',
            Strings.toString(p.tokenId),
            ')"/><rect width="400" height="400" fill="',
            _accent(p),
            '" opacity="0.14"/>',
            pattern
        );
    }

    function _aura(Params memory p) private pure returns (string memory) {
        return string.concat(
            '<circle cx="200" cy="200" r="150" fill="url(#aura',
            Strings.toString(p.tokenId),
            ')" opacity="0.7">',
            '<animate attributeName="r" values="140;160;140" dur="2s" repeatCount="indefinite"/></circle>',
            '<circle cx="200" cy="200" r="135" fill="none" stroke="',
            _accent(p),
            '" stroke-width="5" stroke-dasharray="14 10" stroke-linecap="round">',
            '<animateTransform attributeName="transform" type="rotate" from="0 200 200" to="360 200 200" dur="8s" repeatCount="indefinite"/></circle>'
        );
    }

    function _character(Params memory p) private pure returns (string memory) {
        bool sleepy = !p.awake || p.mood == MOOD_TIRED;
        return string.concat(
            sleepy ? '<g transform="translate(0 10)">' : "<g>",
            _body(p),
            _eyes(p),
            _face(p),
            "</g>",
            _extras(p)
        );
    }

    function _body(Params memory p) private pure returns (string memory) {
        string memory fill = _bodyColor(p);
        string memory belly = _bellyColor(p);
        string memory arms = (p.awake && p.mood == MOOD_FLEXING)
            ? string.concat(
                '<g fill="', fill, '" stroke="', INK, '" stroke-width="3">',
                '<path d="M112 250 Q70 220 88 180 Q110 175 112 205 Z"/><path d="M288 250 Q330 220 312 180 Q290 175 288 205 Z"/></g>'
            )
            : "";
        return string.concat(
            arms,
            string.concat('<g fill="', fill, '" stroke="', INK, '" stroke-width="3">'),
            '<path d="M118 125 L132 42 L188 100 Z"/><path d="M282 125 L268 42 L212 100 Z"/>',
            '<ellipse cx="200" cy="275" rx="95" ry="68"/><ellipse cx="160" cy="338" rx="24" ry="12"/>',
            '<ellipse cx="240" cy="338" rx="24" ry="12"/><circle cx="200" cy="170" r="90"/></g>',
            '<path d="M132 56 L136 92 L160 88 Z" fill="#F9A8D4"/><path d="M268 56 L264 92 L240 88 Z" fill="#F9A8D4"/>',
            string.concat('<g fill="', belly, '"><ellipse cx="200" cy="288" rx="55" ry="40"/>'),
            '<ellipse cx="200" cy="203" rx="40" ry="27"/></g>',
            string.concat('<ellipse cx="200" cy="190" rx="10" ry="7" fill="', INK, '"/>')
        );
    }

    function _eyes(Params memory p) private pure returns (string memory) {
        if (!p.awake || p.mood == MOOD_TIRED) {
            // closed, droopy eyes
            return string.concat(
                '<g fill="none" stroke="', INK, '" stroke-width="4" stroke-linecap="round">',
                '<path d="M150 160 Q165 172 180 160"/><path d="M220 160 Q235 172 250 160"/>',
                '<path d="M152 176 Q165 182 178 176" stroke-width="2" opacity="0.5"/><path d="M222 176 Q235 182 248 176" stroke-width="2" opacity="0.5"/></g>'
            );
        }
        string memory eyes = _eyeStyle(p);
        // Chill and Smug get heavy, half-closed lids (except behind shades)
        if ((p.mood == MOOD_CHILL || p.mood == MOOD_SMUG) && p.traits.eyes != 3) {
            string memory fill = _bodyColor(p);
            eyes = string.concat(
                eyes,
                '<g fill="', fill, '" stroke="', INK, '" stroke-width="3">',
                '<path d="M145 161 A20 20 0 0 1 185 161 Z"/><path d="M215 161 A20 20 0 0 1 255 161 Z"/></g>'
            );
        }
        return eyes;
    }

    function _eyeStyle(Params memory p) private pure returns (string memory) {
        uint8 e = p.traits.eyes;
        if (e == 0) {
            return string.concat('<g fill="', INK, '"><circle cx="165" cy="160" r="10"/><circle cx="235" cy="160" r="10"/></g>');
        }
        if (e == 1) {
            return string.concat(
                '<g fill="#FFF" stroke="', INK, '" stroke-width="3"><circle cx="165" cy="160" r="17"/><circle cx="235" cy="160" r="17"/></g>',
                '<g fill="', INK, '"><circle cx="167" cy="162" r="9"/><circle cx="237" cy="162" r="9"/></g>',
                '<g fill="#FFF"><circle cx="170" cy="157" r="3"/><circle cx="240" cy="157" r="3"/></g>'
            );
        }
        if (e == 2) {
            return string.concat(
                '<g fill="', _accent(p), '" stroke="', INK, '" stroke-width="3"><circle cx="165" cy="160" r="13"/><circle cx="235" cy="160" r="13"/></g>',
                '<g fill="', INK, '"><circle cx="165" cy="160" r="5"/><circle cx="235" cy="160" r="5"/></g>'
            );
        }
        if (e == 3) {
            return string.concat(
                '<g fill="', INK, '"><rect x="138" y="145" width="54" height="30" rx="10"/><rect x="208" y="145" width="54" height="30" rx="10"/><rect x="190" y="152" width="20" height="6"/></g>',
                '<path d="M148 152 L162 152" stroke="', _accent(p), '" stroke-width="4" stroke-linecap="round"/>'
            );
        }
        return string.concat(
            '<g fill="#FFF" stroke="', INK, '" stroke-width="5"><circle cx="165" cy="160" r="12"/><circle cx="235" cy="160" r="12"/></g>',
            '<g fill="', INK, '"><circle cx="165" cy="160" r="4"/><circle cx="235" cy="160" r="4"/></g>'
        );
    }

    /// @dev Brows, mouth and cheeks.
    function _face(Params memory p) private pure returns (string memory) {
        string memory cheeks = string.concat(
            '<g fill="', _accent(p), '" opacity="0.55"><circle cx="133" cy="196" r="13"/><circle cx="267" cy="196" r="13"/></g>'
        );
        string memory open = string.concat('<g fill="none" stroke="', INK, '" stroke-width="4" stroke-linecap="round">');
        if (!p.awake || p.mood == MOOD_TIRED) {
            return string.concat(cheeks, '<ellipse cx="200" cy="220" rx="7" ry="5" fill="', INK, '"/>');
        }
        if (p.mood == MOOD_CHILL) {
            return string.concat(cheeks, open, '<path d="M182 214 Q200 228 218 214"/></g>');
        }
        if (p.mood == MOOD_SMUG) {
            return string.concat(
                cheeks, open, '<path d="M148 132 L182 134"/><path d="M218 126 Q236 114 254 124"/><path d="M182 218 Q205 224 222 206"/></g>'
            );
        }
        if (p.mood == MOOD_CHAOTIC) {
            return string.concat(
                cheeks,
                open,
                '<path d="M146 128 L184 142"/><path d="M254 128 L216 142"/></g>',
                '<path d="M176 210 Q200 248 224 210 Z" fill="', INK,
                '"/><path d="M190 228 Q200 240 210 228 Z" fill="#F87171"/>'
            );
        }
        // Flexing: happy arched brows and a big toothy grin
        return string.concat(
            cheeks,
            open,
            '<path d="M148 134 Q165 120 182 134"/><path d="M218 134 Q235 120 252 134"/></g>',
            '<path d="M172 208 Q200 246 228 208 Z" fill="', INK,
            '"/><path d="M178 210 L222 210 L218 218 L182 218 Z" fill="#FFF"/>'
        );
    }

    /// @dev Mood decorations drawn around the character.
    function _extras(Params memory p) private pure returns (string memory) {
        if (!p.awake || p.mood == MOOD_TIRED) {
            return string.concat(
                '<g fill="', p.awake ? _accent(p) : "#E5E7EB", '" font-weight="bold" stroke="', INK,
                '" stroke-width="1"><text x="290" y="90" font-size="30">Z</text><text x="318" y="66" font-size="22">z</text><text x="338" y="48" font-size="16">z</text></g>'
            );
        }
        if (p.mood == MOOD_CHAOTIC) {
            return string.concat(
                '<g fill="#FDE047" stroke="', INK, '" stroke-width="2">',
                '<path d="M70 110 L95 100 L85 125 L110 118 L80 150 L88 128 L66 134 Z"/>',
                '<path d="M318 105 L343 98 L333 122 L356 116 L326 150 L334 126 L312 130 Z"/></g>',
                '<path d="M268 120 Q276 104 284 120 Q276 130 268 120 Z" fill="#7DD3FC"/>'
            );
        }
        if (p.mood == MOOD_FLEXING) {
            return string.concat(
                '<g fill="', _accent(p), '" stroke="#FFF" stroke-width="1.5">',
                _sparkle("80", "90"),
                _sparkle("320", "80"),
                _sparkle("335", "210"),
                "</g>"
            );
        }
        if (p.mood == MOOD_SMUG) {
            // a tiny shine on the head
            return '<path d="M245 95 l6 -14 l6 14 l14 6 l-14 6 l-6 14 l-6 -14 l-14 -6 Z" fill="#FFF" opacity="0.8"/>';
        }
        // Chill: a little floating music note
        return string.concat(
            '<g fill="', INK, '" opacity="0.7"><ellipse cx="305" cy="118" rx="8" ry="6"/><rect x="311" y="80" width="3" height="38"/>',
            '<path d="M311 80 Q325 86 328 100 Q318 90 311 92 Z"/></g>'
        );
    }

    function _hud(Params memory p) private pure returns (string memory) {
        string memory idText = string.concat(
            '<text x="16" y="30" font-size="16" font-weight="bold" fill="',
            p.traits.background == 4 ? "#FFF" : INK,
            '">#',
            Strings.toString(p.tokenId),
            "</text>"
        );
        string memory badge = string.concat(
            '<rect x="268" y="12" width="120" height="26" rx="13" fill="',
            _accent(p),
            '" stroke="#2B1B3D" stroke-width="2"/><text x="328" y="30" font-size="14" font-weight="bold" text-anchor="middle" fill="#2B1B3D">',
            p.awake ? moodName(p.mood) : "Dormant",
            "</text>"
        );
        return string.concat(idText, badge, p.boosted ? _boostBadge(p) : "", _caption(p));
    }

    function _boostBadge(Params memory p) private pure returns (string memory) {
        return string.concat(
            '<rect x="12" y="300" width="112" height="26" rx="13" fill="#FDE047" stroke="', INK,
            '" stroke-width="2"/><text x="68" y="318" font-size="13" font-weight="bold" text-anchor="middle" fill="', INK,
            '">BOOST ',
            ChogText.formatBps(p.boostBps),
            "</text>"
        );
    }

    function _caption(Params memory p) private pure returns (string memory) {
        return string.concat(
            '<rect x="0" y="346" width="400" height="54" fill="#000" opacity="0.6"/>',
            '<text x="200" y="368" font-size="13" text-anchor="middle" fill="#FFF">',
            ChogText.escapeXml(p.message),
            '</text><text x="200" y="389" font-size="11" text-anchor="middle" fill="#D1D5DB">Lifetime yield ',
            p.yieldText,
            "</text>"
        );
    }

    // ------------------------------------------------------------------
    // Palette helpers
    // ------------------------------------------------------------------

    function _sparkle(string memory x, string memory y) private pure returns (string memory) {
        return string.concat(
            '<path transform="translate(', x, " ", y, ')" d="M0 -16 L4 -4 L16 0 L4 4 L0 16 L-4 4 L-16 0 L-4 -4 Z"/>'
        );
    }

    function _accent(Params memory p) private pure returns (string memory) {
        if (!p.awake) return "#9CA3AF";
        return _pick(p.mood, "#38BDF8", "#FACC15", "#EF4444", "#D946EF", "#94A3B8");
    }

    function _bodyColor(Params memory p) private pure returns (string memory) {
        if (!p.awake) return "#9E9AAE";
        return _pick(p.traits.body, "#8B5CF6", "#F472B6", "#14B8A6", "#F59E0B", "#4B4563");
    }

    function _bellyColor(Params memory p) private pure returns (string memory) {
        if (!p.awake) return "#D4D2DC";
        return _pick(p.traits.body, "#DDD6FE", "#FCE7F3", "#CCFBF1", "#FEF3C7", "#A5A1B8");
    }

    function _pick(uint8 v, string memory a, string memory b, string memory c, string memory d, string memory e)
        private
        pure
        returns (string memory)
    {
        if (v == 0) return a;
        if (v == 1) return b;
        if (v == 2) return c;
        if (v == 3) return d;
        return e;
    }
}
