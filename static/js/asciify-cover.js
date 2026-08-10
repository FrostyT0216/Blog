/**
 * Asciify 封面图波点效果
 *
 * 改编自 canvasui.dev 的 Asciify 组件（AsciifyVanilla.ts），
 * 简化为仅处理 <img> 元素的版本：
 *   - 着色器（VERT / FRAG）与原版完全一致，保证视觉效果相同
 *   - 内容捕获简化为直接 drawImage（去掉 DOM 遍历绘制）
 *   - 文字遮罩始终为空（图片无文字），着色器自动走 ASCII 字形分支
 *   - 鼠标悬停时，一个柔和的 ASCII 透镜跟随光标，将透镜内的图片
 *     转换为 ASCII 字符；离开后透镜淡出，原图完整显示
 *
 * 用法：
 *   import { initAsciifyCovers } from '/js/asciify-cover.js';
 *   initAsciifyCovers();
 */

// ============================================================
// 常量
// ============================================================

const CHARSETS = {
    ascii: [
        0, 128, 131200, 14336, 459200, 469440, 4357252, 18157905, 11512810,
        15724526,
    ],
    blocks: [0, 328000, 22041621, 22369621, 11512810, 33554431],
    binary: [0, 4591758, 15324974],
};

const MAX_GLYPHS = 16;

const DEFAULTS = {
    radius: 0.4,
    softness: 1,
    scale: 2,
    spacing: 1,
    charset: "ascii",
    glyphs: [],
    background: "auto",
    backgroundOpacity: 0,
    contrast: 1,
    brightness: 0,
    invert: 0,
    strength: 1,
    baseStrength: 0,
    followSpeed: 3,
    glow: 0.75,
    aberration: 0.75,
};

// ============================================================
// 着色器（与教程原版完全一致）
// ============================================================

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uContentOffset;
uniform vec2 uResolution;
uniform float uGlyphPx;
uniform float uSpacing;
uniform uint uGlyphs[${MAX_GLYPHS}];
uniform int uGlyphCount;
uniform float uRadius;
uniform float uSoftness;
uniform vec2 uPointer;
uniform float uActive;
uniform vec3 uBg;
uniform float uBackingLum;
uniform float uBgOpacity;
uniform float uLod;
uniform float uContrast;
uniform float uBrightness;
uniform float uInvert;
uniform float uStrength;
uniform float uBase;
uniform float uMaxX;
uniform sampler2D uTextMask;
uniform float uDotPx;
uniform float uDotLod;
uniform float uGlowAmt;
uniform float uAberration;

#define S(a, b, t) smoothstep(a, b, t)

float glyphBit (int index, ivec2 p) {
  if (p.x < 0 || p.x > 4 || p.y < 0 || p.y > 4) return 0.0;
  uint bits = uGlyphs[index];
  return float((bits >> uint((4 - p.x) + 5 * p.y)) & 1u);
}

float hash21 (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 sampleFringe (vec2 uv, float lod, vec2 off) {
  vec4 c = textureLod(uContent, uv, lod);
  c.r = textureLod(uContent, uv + off, lod).r;
  c.b = textureLod(uContent, uv - off, lod).b;
  return c;
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float cellPx = (5.0 + 2.0 * uSpacing) * uGlyphPx;
  vec2 frag = uv * uResolution;
  vec2 cell = floor(frag / cellPx);
  vec2 cellUv = (cell + 0.5) * cellPx / uResolution;

  float aspect = uResolution.x / uResolution.y;
  float dist = length((cellUv - uPointer) * vec2(aspect, 1.0));
  float radius = max(uRadius * uActive, 1e-4);
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lens = (1.0 - S(inner, radius, dist)) * uActive;
  float mask = clamp(max(lens, clamp(uBase, 0.0, 1.0)), 0.0, 1.0)
    * clamp(uStrength, 0.0, 1.0);

  float apply = mask < 0.003 ? 0.0 : step(hash21(cell), mask);

  if (apply < 0.5) {
    outColor = vec4(0.0);
    return;
  }

  vec2 textureUv = vec2(cellUv.x, 1.0 - cellUv.y) + uContentOffset;
  if (textureUv.x < 0.001 || textureUv.x > uMaxX - 0.002 ||
      textureUv.y < 0.001 || textureUv.y > 0.999) {
    outColor = vec4(0.0);
    return;
  }

  vec2 lensDir = (cellUv - uPointer) * vec2(aspect, 1.0);
  float fringeAmp = max(uActive, S(0.0, 0.25, uBase));
  vec2 fringe = normalize(lensDir + 1e-5)
    * clamp(uAberration, 0.0, 1.0) * 0.005
    * S(uRadius * 0.15, uRadius, dist) * fringeAmp;
  fringe = vec2(fringe.x / aspect, -fringe.y);

  float textness = texture(uTextMask, vec2(cellUv.x, 1.0 - cellUv.y)).r;

  if (textness > 0.4) {
    vec2 dotIdx = floor(frag / uDotPx);
    vec2 dotUv = (dotIdx + 0.5) * uDotPx / uResolution;
    vec2 flippedUv = clamp(
      vec2(dotUv.x, 1.0 - dotUv.y) + uContentOffset,
      vec2(0.001), vec2(uMaxX - 0.002, 0.999));
    vec4 ink = sampleFringe(flippedUv, uDotLod, fringe);
    float inkLum = dot(ink.rgb, vec3(0.299, 0.587, 0.114));
    float density = abs(inkLum - uBackingLum);
    density = clamp((density - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);
    density = mix(density, 1.0 - density, clamp(uInvert, 0.0, 1.0));
    float d = length(frag - (dotIdx + 0.5) * uDotPx) / (uDotPx * 0.5);
    float reach = sqrt(density);
    float on = (1.0 - S(reach - 0.3, reach + 0.2, d)) * step(0.03, density);
    vec3 inkColor = clamp(
      uBg + (ink.rgb - uBg) / max(abs(inkLum - uBackingLum), 0.2),
      0.0, 1.0);
    vec4 soft = sampleFringe(flippedUv, uDotLod + 2.5, fringe);
    float softLum = dot(soft.rgb, vec3(0.299, 0.587, 0.114));
    float halo = clamp(abs(softLum - uBackingLum) * 2.2, 0.0, 1.0)
      * clamp(uGlowAmt, 0.0, 1.0) * 0.55;
    vec3 haloColor = clamp(
      uBg + (soft.rgb - uBg) / max(abs(softLum - uBackingLum), 0.2),
      0.0, 1.0);
    vec3 col = mix(haloColor, inkColor, on);
    float alpha = ink.a
      * max(mix(clamp(uBgOpacity, 0.0, 1.0), 1.0, on), halo * (1.0 - on));
    outColor = vec4(col * alpha, alpha);
    return;
  }

  vec4 pixel = sampleFringe(textureUv, uLod, fringe);

  float lum = dot(pixel.rgb, vec3(0.299, 0.587, 0.114));
  float amount = abs(lum - uBackingLum);
  amount = clamp((amount - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);
  amount = mix(amount, 1.0 - amount, clamp(uInvert, 0.0, 1.0));

  int index = min(int(amount * float(uGlyphCount)), uGlyphCount - 1);

  ivec2 local = ivec2(floor((frag - cell * cellPx) / uGlyphPx));
  int pad = int(uSpacing);
  float on = glyphBit(index, ivec2(local.x - pad, local.y - pad));

  vec3 glyphColor = clamp(
    uBg + (pixel.rgb - uBg) / max(abs(lum - uBackingLum), 0.2),
    0.0, 1.0);
  vec3 col = mix(uBg, glyphColor, on);
  float alpha = pixel.a * mix(clamp(uBgOpacity, 0.0, 1.0), 1.0, on);
  outColor = vec4(col * alpha, alpha);
}`;

// ============================================================
// 核心：为单张图片创建 Asciify 实例
// ============================================================

/**
 * @param {HTMLCanvasElement} source  — 隐藏的源画布（用于绘制图片）
 * @param {HTMLImageElement}  img     — 原始图片元素
 * @param {HTMLCanvasElement} output  — 可见的 WebGL 输出画布
 * @param {object}            options — AsciifyOptions（与教程一致）
 * @returns {{ setOptions, resize, destroy } | null}
 */
function createAsciifyImage(source, img, output, options = {}) {
    try {
        return initialize(source, img, output, options);
    } catch (error) {
        console.error("Asciify initialization failed:", error);
        return null;
    }
}

function initialize(source, img, output, options) {
    const config = { ...DEFAULTS, ...options };

    const gl = output.getContext("webgl2", {
        alpha: true,
        desynchronized: true,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
    });
    if (!gl || gl.isContextLost()) return null;

    let destroyed = false;
    let contentDirty = false;
    let wake = () => {};

    // --- 着色器编译 ---
    function compile(type, text) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, text);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader) || "Unknown shader error";
            gl.deleteShader(shader);
            throw new Error(message);
        }
        return shader;
    }

    const vertexShader = compile(gl.VERTEX_SHADER, VERT);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program) || "Unknown program link error";
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error(message);
    }

    // --- Uniform 位置收集 ---
    const uniforms = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = gl.getUniformLocation(program, info.name);
    }

    // --- 全屏四边形 ---
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // --- 内容纹理（图片） ---
    const contentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, contentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0]),
    );

    let contentMaxX = 1;

    // --- 文字遮罩纹理（图片无文字 → 始终为空，着色器走字形分支） ---
    const textMaskTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 0]),
    );

    // --- 图片绘制到源画布（object-fit: cover） ---
    function captureImage() {
        if (destroyed) return;
        if (!img.complete || img.naturalWidth <= 0) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = Math.max(1, Math.round(img.clientWidth));
        const cssH = Math.max(1, Math.round(img.clientHeight));
        const w = Math.max(1, Math.round(cssW * dpr));
        const h = Math.max(1, Math.round(cssH * dpr));
        if (source.width !== w || source.height !== h) {
            source.width = w;
            source.height = h;
        }

        const ctx = source.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, w, h);

        // object-fit: cover + object-position: 50% 50%（居中裁剪）
        const scale = Math.max(
            w / img.naturalWidth,
            h / img.naturalHeight,
        );
        const cropW = w / scale;
        const cropH = h / scale;
        const sx = (img.naturalWidth - cropW) / 2;
        const sy = (img.naturalHeight - cropH) / 2;

        try {
            ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, w, h);
            contentDirty = true;
            wake();
        } catch {
            // 图片可能因 CORS 被污染，静默跳过
        }
    }

    // --- 画布尺寸同步 ---
    function syncCanvasSize() {
        let changed = false;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(output.clientWidth * dpr));
        const height = Math.max(1, Math.round(output.clientHeight * dpr));
        if (output.width !== width || output.height !== height) {
            output.width = width;
            output.height = height;
            changed = true;
        }
        contentMaxX = Math.min(
            1,
            Math.max(0.05, img.clientWidth / Math.max(output.clientWidth, 1)),
        );
        return changed;
    }

    syncCanvasSize();

    // --- 背景色检测（沿 DOM 向上找首个不透明背景） ---
    let backingRgb = [1, 1, 1];
    let backingLum = 1;
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });

    function syncBacking() {
        backingRgb = [1, 1, 1];
        if (probeCtx) {
            let el = img;
            while (el) {
                const bg = getComputedStyle(el).backgroundColor;
                if (bg && bg !== "transparent") {
                    probeCtx.clearRect(0, 0, 1, 1);
                    probeCtx.fillStyle = bg;
                    probeCtx.fillRect(0, 0, 1, 1);
                    const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
                    if (a > 0) {
                        backingRgb = [r / 255, g / 255, b / 255];
                        break;
                    }
                }
                el = el.parentElement;
            }
        }
        backingLum =
            0.299 * backingRgb[0] +
            0.587 * backingRgb[1] +
            0.114 * backingRgb[2];
    }

    syncBacking();

    // --- 指针状态 ---
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
    const glyphData = new Uint32Array(MAX_GLYPHS);

    function resolveGlyphs() {
        const ramp =
            config.glyphs.length > 1
                ? config.glyphs
                : (CHARSETS[config.charset] || CHARSETS.ascii);
        const count = Math.min(ramp.length, MAX_GLYPHS);
        glyphData.fill(0);
        for (let i = 0; i < count; i++) glyphData[i] = ramp[i] >>> 0;
        return count;
    }

    // --- 纹理上传 ---
    function uploadContent() {
        if (!contentDirty) return;
        contentDirty = false;
        try {
            gl.bindTexture(gl.TEXTURE_2D, contentTexture);
            gl.texImage2D(
                gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source,
            );
            gl.generateMipmap(gl.TEXTURE_2D);
        } catch (error) {
            console.warn("Asciify could not upload content texture:", error);
        }
    }

    // --- 渲染 ---
    function render() {
        uploadContent();
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, contentTexture);
        gl.uniform1i(uniforms.uContent, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
        gl.uniform1i(uniforms.uTextMask, 1);
        gl.uniform2f(uniforms.uContentOffset, 0, 0);
        gl.uniform2f(uniforms.uResolution, output.width, output.height);
        const dpr = output.width / Math.max(output.clientWidth, 1);
        const glyphCss = Math.max(config.scale, 0.5);
        const dotCss = Math.max(1.25, glyphCss * 0.75);
        const texelsPerCss = dpr;
        gl.uniform1f(uniforms.uDotPx, dotCss * dpr);
        gl.uniform1f(
            uniforms.uDotLod,
            Math.max(0, Math.log2((dotCss * Math.max(texelsPerCss, 0.25)) / dpr) - 1),
        );
        gl.uniform1f(uniforms.uGlowAmt, config.glow);
        gl.uniform1f(uniforms.uAberration, config.aberration);
        const spacing = Math.round(Math.min(Math.max(config.spacing, 0), 3));
        gl.uniform1f(uniforms.uGlyphPx, glyphCss * dpr);
        gl.uniform1f(uniforms.uSpacing, spacing);
        gl.uniform1f(
            uniforms.uLod,
            Math.max(0, Math.log2((5 + 2 * spacing) * glyphCss) - 1),
        );
        const glyphCount = resolveGlyphs();
        gl.uniform1uiv(uniforms["uGlyphs[0]"], glyphData);
        gl.uniform1i(uniforms.uGlyphCount, glyphCount);
        gl.uniform1f(uniforms.uRadius, Math.max(config.radius, 0.01));
        gl.uniform1f(uniforms.uSoftness, config.softness);
        gl.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
        gl.uniform1f(uniforms.uActive, pointer.active);
        const bg = config.background === "auto" ? backingRgb : config.background;
        gl.uniform3f(uniforms.uBg, bg[0], bg[1], bg[2]);
        gl.uniform1f(uniforms.uBackingLum, backingLum);
        gl.uniform1f(uniforms.uBgOpacity, config.backgroundOpacity);
        gl.uniform1f(uniforms.uContrast, Math.max(config.contrast, 0));
        gl.uniform1f(uniforms.uBrightness, config.brightness);
        gl.uniform1f(uniforms.uInvert, config.invert);
        gl.uniform1f(uniforms.uStrength, config.strength);
        gl.uniform1f(uniforms.uBase, config.baseStrength);
        gl.uniform1f(uniforms.uMaxX, contentMaxX);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, output.width, output.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // --- 渲染循环（指针插值 + 按需渲染） ---
    let raf = 0;
    let lastTime = performance.now();
    let running = false;
    let visible = true;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;

    function frame(now) {
        if (destroyed) return;
        if (!visible) {
            running = false;
            return;
        }
        const delta = Math.min((now - lastTime) / 1000, 1 / 30);
        lastTime = now;
        const ease = reducedMotion
            ? 1
            : 1 - Math.exp(-delta * Math.max(config.followSpeed, 0.5));
        pointer.x += (pointer.tx - pointer.x) * ease;
        pointer.y += (pointer.ty - pointer.y) * ease;
        pointer.active += (pointer.target - pointer.active) * ease;
        const settled =
            Math.abs(pointer.tx - pointer.x) < 5e-4 &&
            Math.abs(pointer.ty - pointer.y) < 5e-4 &&
            Math.abs(pointer.target - pointer.active) < 1e-3;
        if (settled) {
            pointer.x = pointer.tx;
            pointer.y = pointer.ty;
            pointer.active = pointer.target;
        }
        render();
        if (settled && !contentDirty) {
            running = false;
            return;
        }
        raf = requestAnimationFrame(frame);
    }

    function start() {
        if (destroyed || running || !visible) return;
        running = true;
        lastTime = performance.now();
        raf = requestAnimationFrame(frame);
    }

    wake = start;
    captureImage();
    start();

    // --- 事件监听 ---
    function onMotionChange() {
        reducedMotion = motionQuery.matches;
        start();
    }
    motionQuery.addEventListener("change", onMotionChange);

    // 主题切换时重新检测背景色
    let themeTimer = 0;
    function onThemeShift() {
        syncBacking();
        start();
        window.clearTimeout(themeTimer);
        themeTimer = window.setTimeout(() => {
            syncBacking();
            start();
        }, 300);
    }
    const themeObserver = new MutationObserver(onThemeShift);
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
    });
    const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    schemeQuery.addEventListener("change", onThemeShift);

    // 尺寸变化
    const observer = new ResizeObserver(() => {
        if (syncCanvasSize()) captureImage();
        start();
    });
    observer.observe(output);
    observer.observe(img);

    // 可见性
    const intersection = new IntersectionObserver((entries) => {
        visible = entries[entries.length - 1]?.isIntersecting ?? true;
        if (visible) start();
    });
    intersection.observe(output);

    // 指针事件：监听 output 的父元素（.article-image），
    // output 画布设为 pointer-events: none，点击穿透到 <a> 链接
    const listenTarget = output.parentElement || output;

    function onPointerMove(event) {
        const rect = output.getBoundingClientRect();
        pointer.tx = (event.clientX - rect.left) / Math.max(rect.width, 1);
        pointer.ty = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
        pointer.target = 1;
        start();
    }

    function onPointerLeave() {
        pointer.target = 0;
        start();
    }

    listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
    listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });

    // 图片加载完成后重新捕获
    img.addEventListener("load", captureImage);

    return {
        setOptions(next) {
            let changed = false;
            for (const [key, value] of Object.entries(next)) {
                const prev = config[key];
                if (Array.isArray(value) && Array.isArray(prev)) {
                    if (
                        value.length !== prev.length ||
                        value.some((item, i) => item !== prev[i])
                    ) {
                        changed = true;
                        break;
                    }
                } else if (prev !== value) {
                    changed = true;
                    break;
                }
            }
            if (!changed) {
                Object.assign(config, next);
                return;
            }
            Object.assign(config, next);
            syncBacking();
            start();
        },
        resize() {
            syncCanvasSize();
            syncBacking();
            captureImage();
            start();
        },
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            window.clearTimeout(themeTimer);
            observer.disconnect();
            intersection.disconnect();
            themeObserver.disconnect();
            schemeQuery.removeEventListener("change", onThemeShift);
            motionQuery.removeEventListener("change", onMotionChange);
            listenTarget.removeEventListener("pointermove", onPointerMove);
            listenTarget.removeEventListener("pointerleave", onPointerLeave);
            img.removeEventListener("load", captureImage);
            gl.deleteTexture(contentTexture);
            gl.deleteTexture(textMaskTexture);
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            gl.deleteBuffer(quad);
        },
    };
}

// ============================================================
// 首页文章封面图初始化
// ============================================================

const ASCIIFY_OPTION_KEY = "_asciifyInstance";

/**
 * 为单张 .article-image 容器创建 Asciify 覆盖层。
 * @param {HTMLElement} container — .article-image 元素
 * @returns {{ instance: object, output: HTMLCanvasElement, source: HTMLCanvasElement } | null}
 */
function setupCover(container) {
    const img = container.querySelector("img");
    if (!img) return null;

    // 已初始化则跳过
    if (container[ASCIIFY_OPTION_KEY]) return container[ASCIIFY_OPTION_KEY];

    const source = document.createElement("canvas");
    source.className = "asciify-source";
    source.setAttribute("aria-hidden", "true");

    const output = document.createElement("canvas");
    output.className = "asciify-output";
    output.setAttribute("aria-hidden", "true");

    container.appendChild(source);
    container.appendChild(output);

    const init = () => {
        const instance = createAsciifyImage(source, img, output, {
            background: "auto",
            scale: 1.3,       // 字形像素更小 → 单位面积内字符更多，密度更高
            spacing: 0,       // 去掉字符间距，进一步收紧排列
            contrast: 1.3,    // 略微提升对比度，让明暗层次更分明
        });
        container[ASCIIFY_OPTION_KEY] = { instance, output, source };
        return container[ASCIIFY_OPTION_KEY];
    };

    // 图片可能尚未加载（loading="lazy"）
    if (img.complete && img.naturalWidth > 0) {
        return init();
    }

    // 等待加载后初始化
    img.addEventListener("load", init, { once: true });
    return null;
}

/**
 * 扫描页面上的所有 .article-image 封面图，为其添加 Asciify 波点效果。
 * 仅处理 .article-list 内的封面图（首页 / 分类 / 标签等列表页）。
 */
export function initAsciifyCovers() {
    const containers = document.querySelectorAll(
        ".article-list .article-image, .article-list .has-image .article-image",
    );

    containers.forEach((container) => {
        setupCover(container);
    });

    // 监听动态插入的文章卡片（翻页等情况）
    const listEl = document.querySelector(".article-list");
    if (listEl && !listEl._asciifyObserver) {
        const mo = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    const images = node.matches?.(".article-image")
                        ? [node]
                        : Array.from(node.querySelectorAll?.(".article-image") || []);
                    images.forEach((c) => setupCover(c));
                }
            }
        });
        mo.observe(listEl, { childList: true, subtree: true });
        listEl._asciifyObserver = mo;
    }
}
