/**
 * Shown when the device can't run WebGL 2. The planned Lite Mode (a 2D song
 * list) would be linked from here once approved.
 */
export function UnsupportedScreen() {
  return (
    <div className="unsupported">
      <h1>The garden can't grow here</h1>
      <p>This device or browser doesn't support the 3D graphics the garden needs.</p>
      <p>Try a recent version of Chrome, Safari, Firefox or Edge.</p>
    </div>
  );
}
