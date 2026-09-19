// The source photo and its RGB remain intact. Only display alpha uses the validated V12 renderer.
import {displayMatte} from './display-matte.js';

const base = new URL('../../assets/jaspe2d/originals/', import.meta.url);
const cache = new Map();
let manifestPromise;
function manifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(new URL('manifest.json', base))
      .then(response => { if (!response.ok) throw new Error('Portrait manifest unavailable'); return response.json(); })
      .catch(error => { manifestPromise = null; throw error; });
  }
  return manifestPromise;
}

export function authPortrait(ref) {
  const key = ref.pack + '/' + ref.key;
  if (!cache.has(key)) cache.set(key, render(key).catch(error => { cache.delete(key); throw error; }));
  return cache.get(key);
}

async function render(key) {
  const library = await manifest(), pose = library.poses[key];
  if (!pose) throw new Error('Unlisted portrait');
  const response = await fetch(new URL(pose.file, base));
  if (!response.ok) throw new Error('Portrait unavailable');
  const bytes = await response.arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  if (hash !== pose.sha256) throw new Error('Portrait integrity mismatch');
  const sourceURL = URL.createObjectURL(new Blob([bytes], {type: 'image/png'}));
  const image = new Image();
  try {
    image.src = sourceURL;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = library.width;
    canvas.height = library.height;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const result = displayMatte({pixels}, canvas.width, canvas.height, pose.holes, pose.face, pose);
    retainPortrait(result.image);
    const blob = await new Promise(resolve => result.image.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Portrait display failed');
    return URL.createObjectURL(blob);
  } finally { URL.revokeObjectURL(sourceURL); }
}

// V12's matte can leave isolated specks from the textured backdrop. Keep the
// connected character silhouette, seeded in the navy uniform, without changing RGB.
export function retainPortrait(canvas) {
  const context = canvas.getContext('2d'), data = context.getImageData(0, 0, canvas.width, canvas.height);
  const {width, height} = canvas, count = width * height;
  const keep = new Uint8Array(count), queue = new Int32Array(count);
  let head = 0, tail = 0;
  function add(index) {
    if (!keep[index] && data.data[index * 4 + 3]) { keep[index] = 1; queue[tail++] = index; }
  }
  add(750 * width + 515);
  while (head < tail) {
    const index = queue[head++], x = index % width;
    if (x) add(index - 1);
    if (x < width - 1) add(index + 1);
    if (index >= width) add(index - width);
    if (index < count - width) add(index + width);
  }
  for (let i = 0; i < count; i++) if (!keep[i]) data.data[i * 4 + 3] = 0;
  context.putImageData(data, 0, 0);
}
