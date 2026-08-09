/**
 * 半色调动态 3D 小鸭子（侧边栏用）
 *
 * 基于 canvasui.dev 的 Dithered Object 组件（vanilla createDitheredObject）改造：
 *  - 仅保留 GLB/glTF 加载分支（鸭子模型），裁掉图片/SVG 矢量化的冗余代码
 *  - 新增 uTint 着色：把抖动后的「白色」像素染成苍绿色 #7cab86
 *  - 新增 mouseFollow：让模型朝向始终平滑指向鼠标位置
 *  - initDitheredDuck 包装器：竖屏状态下不初始化（不渲染），切回横屏再构建
 *
 * three.js 通过 esm.sh 在运行时按 ES Module 引入，无需打包。
 */
import * as THREE from "https://esm.sh/three@0.171.0";
import { OrbitControls } from "https://esm.sh/three@0.171.0/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "https://esm.sh/three@0.171.0/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "https://esm.sh/three@0.171.0/examples/jsm/loaders/GLTFLoader.js";

const DEFAULTS = {
  src: "",
  method: "bayer",
  gridSize: 4,
  pixelSizeRatio: 1,
  grayscale: true,
  invert: false,
  dither: true,
  background: "",
  highlight: "#066aff",
  tint: "",
  baseYaw: 0,
  environmentIntensity: 0.1,
  roughness: -1,
  scale: 3,
  xOffset: 0,
  yOffset: 0,
  floatIntensity: 2,
  rotationIntensity: 1,
  floatSpeed: 2,
  orbit: true,
  zoom: false,
  autoRotate: false,
  autoRotateSpeed: 2,
  fov: 65,
  cameraDistance: 4.2,
  cameraTilt: 0,
  dracoDecoderPath: "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
  mouseFollow: false,
  onLoad: null,
  onError: null,
};

const POST_VERT = `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const SRGB_ENCODE = `
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`;

const LEVEL_FRAG = `
precision highp float;
out vec4 outColor;
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uGridSize;
uniform float uPixelSizeRatio;
${SRGB_ENCODE}
void main() {
  vec2 fragCoord = (floor(gl_FragCoord.xy) + 0.5) * uGridSize;
  float pixelSize = uGridSize * uPixelSizeRatio;
  vec2 pixelUv = (floor(fragCoord / pixelSize) + 0.5) * pixelSize / uResolution;
  vec4 tex = texture(tDiffuse, pixelUv);
  outColor = vec4(toSrgb(tex.rgb), tex.a);
}`;

const POST_FRAG = `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uGridSize;
uniform float uPixelSizeRatio;
uniform float uGrayscale;
uniform float uInvert;
uniform float uDither;
uniform int uMethod;
uniform sampler2D tMask;
uniform vec3 uTint;

const mat4 THRESHOLDS = mat4(
  0.94118, 0.29412, 0.76471, 0.05882,
  0.47059, 0.70588, 0.23529, 0.52941,
  0.82353, 0.11765, 0.88235, 0.17647,
  0.35294, 0.58824, 0.41176, 0.64706
);

const float SCREEN_ANGLE = 0.70710678;
const float CORNER_REACH = 1.41421356;
${SRGB_ENCODE}
float bayerThreshold(vec2 cellCoord) {
  ivec2 p = ivec2(mod(cellCoord, 4.0));
  return THRESHOLDS[p.x][p.y];
}

float halftoneThreshold(vec2 cellCoord) {
  vec2 screen = vec2(
    cellCoord.x * SCREEN_ANGLE - cellCoord.y * SCREEN_ANGLE,
    cellCoord.x * SCREEN_ANGLE + cellCoord.y * SCREEN_ANGLE
  );
  return clamp(length(fract(screen) - 0.5) * CORNER_REACH, 0.0, 1.0);
}

float thresholdAt(vec2 cellCoord) {
  if (uMethod == 1) return halftoneThreshold(cellCoord);
  return bayerThreshold(cellCoord);
}

bool maskAt(vec2 cellCoord) {
  ivec2 last = textureSize(tMask, 0) - ivec2(1);
  ivec2 cell = clamp(ivec2(floor(cellCoord)), ivec2(0), last);
  return texelFetch(tMask, cell, 0).r > 0.5;
}

void main() {
  vec2 fragCoord = vUv * uResolution;
  if (uDither < 0.5) {
    vec4 raw = texture(tDiffuse, vUv);
    vec3 c = toSrgb(raw.rgb) * uTint;
    outColor = vec4(c * raw.a, raw.a);
    return;
  }
  float pixelSize = uGridSize * uPixelSizeRatio;
  vec2 pixelUv = (floor(fragCoord / pixelSize) + 0.5) * pixelSize / uResolution;
  vec4 tex = texture(tDiffuse, pixelUv);
  vec3 color = toSrgb(tex.rgb);

  float level = dot(color, vec3(1.0));
  if (uGrayscale > 0.5) color = vec3(level);
  vec2 cellCoord = fragCoord / uGridSize;
  bool lit = uMethod == 2
    ? maskAt(cellCoord)
    : level >= thresholdAt(cellCoord);
  if (!lit) color = vec3(0.0);
  if (uInvert > 0.5) color = 1.0 - color;

  color *= uTint;
  outColor = vec4(color * tex.a, tex.a);
}`;

function diffuse(pixels, mask, rows, width, height) {
  let current = rows[0];
  let next = rows[1];
  current.fill(0);
  for (let y = 0; y < height; y++) {
    next.fill(0);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4;
      const tone =
        Math.min((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 255, 1) +
        current[x + 1];
      const lit = tone >= 0.5;
      mask[row + x] = lit ? 255 : 0;
      const error = lit ? tone - 1 : tone;
      current[x + 2] += error * 0.4375;
      next[x] += error * 0.1875;
      next[x + 1] += error * 0.3125;
      next[x + 2] += error * 0.0625;
    }
    const spent = current;
    current = next;
    next = spent;
  }
}

const ROOM_BLOCKS = [
  { position: [-10.906, -1, 1.846], rotation: [0, -0.195, 0], scale: [2.328, 7.905, 4.651] },
  { position: [-5.607, -0.754, -0.758], rotation: [0, 0.994, 0], scale: [1.97, 1.534, 3.955] },
  { position: [6.167, -0.16, 7.803], rotation: [0, 0.561, 0], scale: [3.927, 6.285, 3.687] },
  { position: [-2.017, 0.018, 6.124], rotation: [0, 0.333, 0], scale: [2.002, 4.566, 2.064] },
  { position: [2.291, -0.756, -2.621], rotation: [0, -0.286, 0], scale: [1.546, 1.552, 1.496] },
  { position: [-2.193, -0.369, -5.547], rotation: [0, 0.516, 0], scale: [3.875, 3.487, 2.986] },
];

const ROOM_FORMERS = [
  { kind: "ring", intensity: 15, position: [2, 3, -2], scale: [10, 10, 10], lookAtCenter: true },
  { kind: "box", intensity: 80, position: [-14, 10, 8], scale: [0.1, 2.5, 2.5] },
  { kind: "box", intensity: 80, position: [-14, 14, -4], scale: [0.1, 2.5, 2.5], withLight: true },
  { kind: "box", intensity: 23, position: [14, 12, 0], scale: [0.1, 5, 5], withLight: true },
  { kind: "box", intensity: 16, position: [0, 9, 14], scale: [5, 5, 0.1], withLight: true },
  { kind: "box", intensity: 80, position: [7, 8, -14], scale: [2.5, 2.5, 0.1], withLight: true },
  { kind: "box", intensity: 80, position: [-7, 16, -14], scale: [2.5, 2.5, 0.1], withLight: true },
  { kind: "box", intensity: 1, position: [0, 20, 0], scale: [0.1, 0.1, 0.1], withLight: true },
  { kind: "box", intensity: 20, position: [0, 15, 0], scale: [10, 1, 10], withLight: true },
];

const CAMERA_DIR = new THREE.Vector3(0, -1, 4).normalize();
const MODEL_LIFT = 0.3;
const METHOD_INDEX = { bayer: 0, halftone: 1, floyd: 2 };

// 在 YZ 竖直平面绕 X 轴顺时针旋转 tiltDeg 度后的相机方向（从屏幕右侧看为顺时针）
function cameraDirWithTilt(tiltDeg) {
  const base = new THREE.Vector3(0, -1, 4);
  const phi = (tiltDeg || 0) * Math.PI / 180;
  if (!phi) return CAMERA_DIR;
  const c = Math.cos(phi), s = Math.sin(phi);
  return new THREE.Vector3(0, base.y * c - base.z * s, base.y * s + base.z * c).normalize();
}

function sniffKind(bytes) {
  if (bytes.length < 4) return null;
  const ascii = (start, text) => {
    for (let i = 0; i < text.length; i++) {
      if (bytes[start + i] !== text.charCodeAt(i)) return false;
    }
    return true;
  };
  if (ascii(0, "glTF")) return "glb";
  if (bytes[0] === 0x89 && ascii(1, "PNG")) return "bitmap";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "bitmap";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "bitmap";
  if (ascii(0, "GIF8")) return "bitmap";
  let head = "";
  try {
    head = new TextDecoder()
      .decode(bytes.subarray(0, 2048))
      .replace(/^\uFEFF/, "")
      .trimStart();
  } catch {
    return null;
  }
  if (head.startsWith("{")) return "gltf";
  if (head.startsWith("<")) return head.includes("<svg") ? "svg" : null;
  return null;
}

function disposeObject(root) {
  root.traverse((node) => {
    const mesh = node;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (!(value instanceof THREE.Texture)) continue;
        value.dispose();
      }
      material.dispose();
    }
  });
}

export function createDitheredObject(elements, options = {}) {
  const { canvas } = elements;
  const config = { ...DEFAULTS, ...options };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(config.fov, 1, 0.1, 200);
  camera.position.copy(cameraDirWithTilt(config.cameraTilt)).multiplyScalar(config.cameraDistance);

  const floatGroup = new THREE.Group();
  floatGroup.position.y = MODEL_LIFT;
  const fitGroup = new THREE.Group();
  fitGroup.rotation.y = config.baseYaw;
  floatGroup.add(fitGroup);
  scene.add(floatGroup);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;

  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;

  const postMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    uniforms: {
      tDiffuse: { value: target.texture },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uGridSize: { value: 4 },
      uPixelSizeRatio: { value: 1 },
      uGrayscale: { value: 1 },
      uInvert: { value: 0 },
      uDither: { value: 1 },
      uMethod: { value: 0 },
      tMask: { value: null },
      uTint: { value: new THREE.Vector3(1, 1, 1) },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const postGeometry = new THREE.BufferGeometry();
  postGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const postMesh = new THREE.Mesh(postGeometry, postMaterial);
  postMesh.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(postMesh);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const levelMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: POST_VERT,
    fragmentShader: LEVEL_FRAG,
    uniforms: {
      tDiffuse: { value: target.texture },
      uResolution: postMaterial.uniforms.uResolution,
      uGridSize: postMaterial.uniforms.uGridSize,
      uPixelSizeRatio: postMaterial.uniforms.uPixelSizeRatio,
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const levelMesh = new THREE.Mesh(postGeometry, levelMaterial);
  levelMesh.frustumCulled = false;
  const levelScene = new THREE.Scene();
  levelScene.add(levelMesh);

  const diffusion = {
    target: null,
    texture: null,
    pixels: new Uint8Array(0),
    mask: new Uint8Array(0),
    rows: [new Float32Array(0), new Float32Array(0)],
    width: 0,
    height: 0,
    generation: 0,
    pending: false,
    ready: false,
  };

  const pmrem = new THREE.PMREMGenerator(renderer);
  let roomScene = null;
  let ringMaterial = null;
  let envTarget = null;
  let envDirty = true;

  function buildRoom() {
    roomScene = new THREE.Scene();
    const room = new THREE.Group();
    room.position.set(0, -0.5, 0);
    roomScene.add(room);

    for (const [x, z] of [[-15, 15], [15, 15], [15, -15], [-15, -15]]) {
      const spot = new THREE.SpotLight(0xffffff, 2, 0, 0.2, 1, 0);
      spot.position.set(x, 20, z);
      room.add(spot, spot.target);
    }
    const center = new THREE.PointLight(0xffffff, 100, 28, 2);
    center.position.set(0.5, 14, 0.5);
    room.add(center);

    const box = new THREE.BoxGeometry();
    const shell = new THREE.Mesh(
      box,
      new THREE.MeshStandardMaterial({ color: "gray", side: THREE.BackSide }),
    );
    shell.position.set(0, 13.2, 0);
    shell.scale.set(31.5, 28.5, 31.5);
    room.add(shell);

    const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const def of ROOM_BLOCKS) {
      const mesh = new THREE.Mesh(box, white);
      mesh.position.set(...def.position);
      mesh.rotation.set(...def.rotation);
      mesh.scale.set(...def.scale);
      room.add(mesh);
    }

    for (const def of ROOM_FORMERS) {
      const geometry =
        def.kind === "ring" ? new THREE.RingGeometry(0.5, 1, 64) : new THREE.BoxGeometry();
      const material = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      material.color
        .set(def.kind === "ring" ? config.highlight : "#ffffff")
        .multiplyScalar(def.intensity);
      if (def.kind === "ring") ringMaterial = material;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...def.position);
      mesh.scale.set(...def.scale);
      if (def.lookAtCenter) mesh.lookAt(0, 0, 0);
      room.add(mesh);
      if (def.withLight) {
        const light = new THREE.PointLight(0xffffff, 100, 28, 2);
        light.position.set(...def.position);
        room.add(light);
      }
    }
  }

  function refreshEnvironment() {
    if (!roomScene) buildRoom();
    if (ringMaterial) {
      ringMaterial.color.set(config.highlight).multiplyScalar(15);
    }
    envTarget?.dispose();
    envTarget = pmrem.fromScene(roomScene, 0, 0.1, 1000);
    scene.environment = envTarget.texture;
  }

  let model = null;
  let modelMaxDim = 1;
  let loadedSrc = null;
  let loadToken = 0;
  let disposed = false;

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(config.dracoDecoderPath);
  loader.setDRACOLoader(draco);

  function applyRoughness() {
    if (!model) return;
    model.traverse((node) => {
      const mesh = node;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material || typeof material.roughness !== "number") continue;
        if (material.userData.baseRoughness === undefined) {
          material.userData.baseRoughness = material.roughness;
        }
        material.roughness =
          config.roughness >= 0 ? config.roughness : material.userData.baseRoughness;
      }
    });
  }

  function applyFit() {
    if (!model) return;
    fitGroup.scale.setScalar(config.scale / modelMaxDim);
  }

  function applyTint() {
    if (config.tint) {
      const h = String(config.tint).replace("#", "").trim();
      const n = parseInt(h, 16);
      if (!isNaN(n)) {
        postMaterial.uniforms.uTint.value.set(
          ((n >> 16) & 255) / 255,
          ((n >> 8) & 255) / 255,
          (n & 255) / 255,
        );
        return;
      }
    }
    postMaterial.uniforms.uTint.value.set(1, 1, 1);
  }

  function clearModel() {
    if (!model) return;
    fitGroup.remove(model);
    disposeObject(model);
    model = null;
  }

  function adoptModel(object) {
    clearModel();
    model = object;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const offset = bounds.getCenter(new THREE.Vector3());
    modelMaxDim = Math.max(size.x, size.y, size.z, 1e-4);
    model.position.sub(offset);
    applyRoughness();
    applyFit();
    fitGroup.add(model);
  }

  async function loadAsset() {
    const src = config.src;
    if (src === loadedSrc) return;
    loadedSrc = src;
    const token = ++loadToken;
    if (!src) {
      clearModel();
      return;
    }
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (disposed || token !== loadToken) return;
      const bytes = new Uint8Array(buffer);
      const kind = sniffKind(bytes);
      if (!kind) throw new Error("Unrecognized asset format");
      if (kind !== "glb" && kind !== "gltf") throw new Error("Only GLB/glTF assets are supported");

      draco.setDecoderPath(config.dracoDecoderPath);
      const resourcePath = src.slice(0, src.lastIndexOf("/") + 1);
      const data = kind === "glb" ? buffer : new TextDecoder().decode(bytes);
      const gltf = await loader.parseAsync(data, resourcePath);
      if (disposed || token !== loadToken) {
        disposeObject(gltf.scene);
        return;
      }
      adoptModel(gltf.scene);
      config.onLoad?.();
    } catch (error) {
      if (disposed || token !== loadToken) return;
      config.onError?.(error);
    }
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;
  const onMotionChange = () => {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) floatGroup.rotation.set(0, 0, 0);
    applyOptions();
  };
  motionQuery.addEventListener("change", onMotionChange);

  function releaseDiffusion() {
    diffusion.target?.dispose();
    diffusion.texture?.dispose();
    diffusion.target = null;
    diffusion.texture = null;
  }

  function methodIndex() {
    const index = METHOD_INDEX[config.method] ?? 0;
    return index === 2 && !diffusion.ready ? 0 : index;
  }

  function resizeDiffusion(width, height) {
    if (diffusion.target && diffusion.width === width && diffusion.height === height) {
      return;
    }
    releaseDiffusion();
    diffusion.width = width;
    diffusion.height = height;
    diffusion.generation += 1;
    diffusion.ready = false;
    diffusion.target = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    diffusion.pixels = new Uint8Array(width * height * 4);
    diffusion.mask = new Uint8Array(width * height);
    diffusion.rows = [new Float32Array(width + 2), new Float32Array(width + 2)];
    diffusion.texture = new THREE.DataTexture(
      diffusion.mask,
      width,
      height,
      THREE.RedFormat,
    );
    diffusion.texture.needsUpdate = true;
    postMaterial.uniforms.tMask.value = diffusion.texture;
    postMaterial.uniforms.uMethod.value = methodIndex();
  }

  function updateDiffusion() {
    if (diffusion.pending) return;
    const resolution = postMaterial.uniforms.uResolution.value;
    const gridSize = postMaterial.uniforms.uGridSize.value;
    resizeDiffusion(
      Math.max(Math.ceil(resolution.x / gridSize), 1),
      Math.max(Math.ceil(resolution.y / gridSize), 1),
    );
    const surface = diffusion.target;
    if (!surface) return;
    renderer.setRenderTarget(surface);
    renderer.render(levelScene, postCamera);
    const { generation, width, height, pixels } = diffusion;
    diffusion.pending = true;
    renderer
      .readRenderTargetPixelsAsync(surface, 0, 0, width, height, pixels)
      .then(() => {
        diffusion.pending = false;
        if (disposed || generation !== diffusion.generation) return;
        diffuse(pixels, diffusion.mask, diffusion.rows, width, height);
        if (diffusion.texture) diffusion.texture.needsUpdate = true;
        if (!diffusion.ready) {
          diffusion.ready = true;
          postMaterial.uniforms.uMethod.value = methodIndex();
        }
      })
      .catch(() => {
        diffusion.pending = false;
      });
  }

  function applyOptions() {
    renderer.setClearColor(
      new THREE.Color(config.background || "#000000"),
      config.background ? 1 : 0,
    );
    scene.environmentIntensity = config.environmentIntensity;
    controls.enableRotate = config.orbit;
    controls.enableZoom = config.zoom;
    controls.autoRotate = config.autoRotate && !reducedMotion;
    controls.autoRotateSpeed = config.autoRotateSpeed;
    camera.fov = config.fov;
    camera.updateProjectionMatrix();
    floatGroup.position.x = config.xOffset;
    floatGroup.position.y = MODEL_LIFT + config.yOffset;
    const pr = renderer.getPixelRatio();
    postMaterial.uniforms.uGridSize.value = Math.max(config.gridSize, 1) * pr;
    postMaterial.uniforms.uPixelSizeRatio.value = Math.max(config.pixelSizeRatio, 1);
    postMaterial.uniforms.uGrayscale.value = config.grayscale ? 1 : 0;
    postMaterial.uniforms.uInvert.value = config.invert ? 1 : 0;
    postMaterial.uniforms.uDither.value = config.dither ? 1 : 0;
    postMaterial.uniforms.uMethod.value = methodIndex();
    applyTint();
    applyRoughness();
    applyFit();
  }

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
    const pixelSize = config.dither
      ? Math.max(config.gridSize, 1) * Math.max(config.pixelSizeRatio, 1) * pr
      : 1;
    const targetScale = Math.min(1, 2 / pixelSize);
    target.setSize(
      Math.max(Math.round(width * pr * targetScale), 1),
      Math.max(Math.round(height * pr * targetScale), 1),
    );
    postMaterial.uniforms.uResolution.value.set(
      Math.round(width * pr),
      Math.round(height * pr),
    );
    postMaterial.uniforms.uGridSize.value = Math.max(config.gridSize, 1) * pr;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  applyOptions();
  loadAsset();

  // 鼠标跟随：模型朝向始终平滑指向鼠标位置
  // 用 atan2 把「鼠标相对画布中心的偏移」换算成自然的视线角度，
  // 再钳制在合理范围内，避免鸭子因画布贴在屏幕边缘而转成侧脸/后脑勺。
  const mouseTarget = { x: 0, y: 0 };
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const focal = Math.max(window.innerWidth * 0.5, 360);
    mouseTarget.x = Math.atan2(e.clientX - cx, focal);
    mouseTarget.y = Math.atan2(e.clientY - cy, focal);
  }
  if (config.mouseFollow) {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
  }

  let inView = true;
  let loopRunning = false;

  function tick(time) {
    if (!inView) {
      lastTime = 0;
      stopLoop();
      return;
    }
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    if (envDirty) {
      envDirty = false;
      refreshEnvironment();
    }
    controls.update();

    if (!reducedMotion) {
      elapsed += delta * config.floatSpeed;
      floatGroup.rotation.x = (Math.cos(elapsed / 4) / 8) * config.rotationIntensity;
      floatGroup.rotation.y = (Math.sin(elapsed / 4) / 8) * config.rotationIntensity;
      floatGroup.rotation.z = (Math.sin(elapsed / 4) / 20) * config.rotationIntensity;
      floatGroup.position.y =
        MODEL_LIFT + config.yOffset + (Math.sin(elapsed / 1.5) / 10) * config.floatIntensity;
    }

    if (config.mouseFollow) {
      // baseYaw 为初始水平朝向（顺时针90度侧身 = -π/2）
      // x/y 恢复同向跟随：鼠标右移 → 鸭子头向右摆；y 方向（pitch）加快响应
      const yawTarget = config.baseYaw + mouseTarget.x * 0.9;
      const pitchTarget = mouseTarget.y * 0.6;
      fitGroup.rotation.y += (yawTarget - fitGroup.rotation.y) * 0.1;
      fitGroup.rotation.x += (pitchTarget - fitGroup.rotation.x) * 0.1;
    }

    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    if (config.dither && config.method === "floyd") updateDiffusion();
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  }

  function startLoop() {
    if (loopRunning || !inView || disposed) return;
    loopRunning = true;
    renderer.setAnimationLoop(tick);
  }

  function stopLoop() {
    if (!loopRunning) return;
    loopRunning = false;
    renderer.setAnimationLoop(null);
  }

  const viewObserver =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          inView = entries[entries.length - 1]?.isIntersecting ?? true;
          if (inView) {
            startLoop();
          } else {
            stopLoop();
          }
        })
      : null;
  viewObserver?.observe(canvas);

  let lastTime = 0;
  let elapsed = Math.random() * 100;

  startLoop();

  return {
    setOptions(next) {
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        if (config[key] !== value) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        Object.assign(config, next);
        return;
      }

      const previousHighlight = config.highlight;
      const previousDistance = config.cameraDistance;
      const previousTilt = config.cameraTilt;
      Object.assign(config, next);
      if (config.highlight !== previousHighlight) envDirty = true;
      if (config.cameraDistance !== previousDistance || config.cameraTilt !== previousTilt) {
        camera.position.copy(cameraDirWithTilt(config.cameraTilt)).multiplyScalar(config.cameraDistance);
      }
      applyOptions();
      resize();
      loadAsset();
      startLoop();
    },
    resize,
    _rotation() {
      return {
        yaw: fitGroup.rotation.y,
        pitch: fitGroup.rotation.x,
        mx: mouseTarget.x,
        my: mouseTarget.y,
      };
    },
    destroy() {
      disposed = true;
      loadToken += 1;
      stopLoop();
      observer.disconnect();
      viewObserver?.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("mousemove", onMouseMove);
      controls.dispose();
      clearModel();
      if (roomScene) disposeObject(roomScene);
      envTarget?.dispose();
      pmrem.dispose();
      draco.dispose();
      target.dispose();
      releaseDiffusion();
      levelMaterial.dispose();
      postGeometry.dispose();
      postMaterial.dispose();
      renderer.dispose();
    },
  };
}

/**
 * 在给定 canvas 上初始化小鸭子。
 * - 竖屏状态下不初始化（不渲染）；切回横屏自动构建。
 * - 横屏下 duck 朝向始终跟随鼠标，抖动白色像素被染成苍绿色。
 */
export function initDitheredDuck(canvas) {
  if (!canvas) return { destroy() {} };

  const duckSrc = "/models/Duck.glb";
  const landscapeMQ = window.matchMedia("(orientation: landscape)");
  let instance = null;

  function build() {
    if (instance) return;
    instance = createDitheredObject({ canvas }, {
      src: duckSrc,
      method: "bayer",
      gridSize: 2,
      grayscale: true,
      highlight: "#7cab86",
      tint: "#7cab86",
      baseYaw: -Math.PI / 2,
      environmentIntensity: 0.25,
      cameraTilt: -30,
      scale: 3.4,
      floatIntensity: 1.4,
      rotationIntensity: 0,
      floatSpeed: 1.6,
      orbit: false,
      zoom: false,
      autoRotate: false,
      mouseFollow: true,
      onLoad: () => { window.__duckStatus = "loaded"; window.__duckInstance = instance; },
      onError: (err) => { window.__duckStatus = "error:" + (err && err.message ? err.message : err); },
    });
  }

  function teardown() {
    if (!instance) return;
    instance.destroy();
    instance = null;
  }

  function apply() {
    if (landscapeMQ.matches) build();
    else teardown();
  }

  apply();
  landscapeMQ.addEventListener("change", apply);

  return {
    destroy() {
      teardown();
      landscapeMQ.removeEventListener("change", apply);
    },
  };
}
