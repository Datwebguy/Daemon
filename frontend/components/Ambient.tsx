/**
 * The living background behind every page: soft colour blobs that drift slowly,
 * so nothing ever sits on a flat, static wash. Pure CSS (see `.ambient` in globals.css);
 * it holds still for visitors who ask for reduced motion.
 */
export function Ambient() {
  return (
    <div aria-hidden className="ambient">
      <i />
      <i />
      <i />
      <i />
      <span className="ambient-dots" />
    </div>
  );
}
