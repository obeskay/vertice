// How to play: a Rive demo of the controls (the arrow keys, or the two halves
// of the screen on touch) that plays twice on the first screen, then holds
// still. Source: rive/hint/build.py. The two chevrons stay until it is ready,
// and for good if it never is.
// ponytail: ~480 KB gzipped of runtime for one hint, so it loads only after
// the game is up and never on save-data; drop to CSS if the menu ever grows.
const VENDOR = new URL('../../vendor/rive/', import.meta.url).href;
const FILE = new URL('../../assets/hint.riv', import.meta.url).href;
const REST_AT = 2 * 3.5 + 0.3; // seconds: the demo twice, then the mix into rest

export function loadHint(canvas) {
  let rive = null;
  let gone = false;
  let played = 0;
  const script = document.createElement('script');
  script.src = VENDOR + 'rive.js';
  script.onload = () => {
    if (gone) return;
    const { Rive, RuntimeLoader } = window.rive;
    RuntimeLoader.setWasmUrl(VENDOR + 'rive.wasm');
    RuntimeLoader.setWasmFallbackUrl?.(VENDOR + 'rive.wasm'); // never reach out to a CDN
    rive = new Rive({
      src: FILE,
      canvas,
      artboard: matchMedia('(pointer: coarse)').matches ? 'Touch' : 'Keys',
      stateMachine: 'Hint',
      // Reduced motion: the authored rest pose is the hint, drawn and left still
      autoplay: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      onLoad: () => {
        if (gone) return;
        document.body.classList.add('hinted'); // sizes the canvas before the surface is
        rive.resizeDrawingSurfaceToCanvas();
      },
      // Once it rests there is nothing left to draw: stop the runtime's frame loop
      onAdvance: (e) => { played += e.data; if (played > REST_AT) rive.pause(); }
    });
  };
  document.head.append(script);

  return {
    /** The first run starts: the hint is done for this visit */
    done() {
      gone = true;
      document.body.classList.remove('hinted');
      rive?.cleanup();
      rive = null;
    }
  };
}
