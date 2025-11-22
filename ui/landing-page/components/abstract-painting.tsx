"use client";

import { useEffect, useRef } from "react";

////////////////////////////////////////////////////////////////////////////////
// CONFIG SECTION (EASY-TO-EDIT VARIABLES)
// Modified for cyberpunk neon aesthetic with circuit patterns, no glitches
////////////////////////////////////////////////////////////////////////////////

// Zoom factor for the visual pattern
const ZOOM_FACTOR = 0.25;

// Base wave amplitude in domain warping
const BASE_WAVE_AMPLITUDE = 0.3;

// Additional factor for random amplitude variations
const RANDOM_WAVE_FACTOR = 0.2;

// Frequency multiplier for wave domain warp
const WAVE_FREQUENCY = 3.5;

// Time speed factor (overall speed of animation)
const TIME_FACTOR = 0.2;

// Swirl strength near the center
const BASE_SWIRL_STRENGTH = 1.5;

// Finer swirl timing factor
const SWIRL_TIME_MULT = 4.0;

// Additional swirl effect modulated by noise
const NOISE_SWIRL_FACTOR = 0.25;

// Number of fractal noise octaves in fbm (must be integer)
const FBM_OCTAVES = 8;

// Circuit pattern intensity
const CIRCUIT_INTENSITY = 0.15;

// Circuit pattern scale (higher = smaller circuits)
const CIRCUIT_SCALE = 20.0;

// 20-step palette of cyberpunk neon colors
// Deep blacks to vibrant neons
const cyberpunkColors = [
    [0.01, 0.01, 0.02], // Near black
    [0.02, 0.02, 0.05], // Very dark blue
    [0.03, 0.02, 0.08], // Dark blue
    [0.05, 0.0, 0.12], // Deep blue
    [0.1, 0.0, 0.2], // Deep purple
    [0.2, 0.0, 0.3], // Purple
    [0.3, 0.0, 0.5], // Bright purple
    [0.5, 0.0, 0.8], // Neon purple
    [0.7, 0.0, 1.0], // Electric purple
    [0.9, 0.0, 0.9], // Hot pink
    [1.0, 0.0, 0.7], // Neon pink
    [1.0, 0.0, 0.5], // Bright pink
    [1.0, 0.0, 0.3], // Red-pink
    [1.0, 0.1, 0.1], // Neon red
    [1.0, 0.3, 0.0], // Orange-red
    [1.0, 0.5, 0.0], // Neon orange
    [0.7, 1.0, 0.0], // Acid green
    [0.0, 1.0, 0.5], // Neon green
    [0.0, 1.0, 0.8], // Cyan
    [0.0, 0.8, 1.0], // Electric blue
];

////////////////////////////////////////////////////////////////////////////////
// DYNAMIC FRAGMENT SHADER BUILDER
////////////////////////////////////////////////////////////////////////////////

function buildFragmentShader(): string {
    // Force integer for the for-loop
    const fbmOctavesInt = Math.floor(FBM_OCTAVES);

    // Convert cyberpunkColors array to GLSL array of vec3
    const colorArraySrc = cyberpunkColors
        .map((c) => `vec3(${c[0]}, ${c[1]}, ${c[2]})`)
        .join(",\n  ");

    return `#version 300 es

precision highp float;
out vec4 outColor;

uniform vec2 uResolution;
uniform float uTime;

#define NUM_COLORS 20
#define PI 3.14159265359

// 20-step palette of cyberpunk neon colors
vec3 cyberpunkColors[NUM_COLORS] = vec3[](
  ${colorArraySrc}
);

// ----------------------------------------------------------
// Perlin-like noise
// ----------------------------------------------------------
vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float noise2D(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
    -0.577350269189626,
    0.024390243902439
  );

  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);

  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;

  i = mod(i, 289.0);
  vec3 p = permute(
    permute(i.y + vec3(0.0, i1.y, 1.0)) +
    i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
    0.5 - vec3(
      dot(x0, x0),
      dot(x12.xy, x12.xy),
      dot(x12.zw, x12.zw)
    ),
    0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;

  m *= 1.792843 - 0.853734 * (a0 * a0 + h * h);

  vec3 g;
  g.x  = a0.x  * x0.x + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;

  return 130.0 * dot(m, g);
}

// ----------------------------------------------------------
// Fractional Brownian Motion
// ----------------------------------------------------------
float fbm(vec2 st) {
  float value = 0.0;
  float amplitude = 0.5;
  float freq = 1.0;
  for (int i = 0; i < ${fbmOctavesInt}; i++) {
    value += amplitude * noise2D(st * freq);
    freq *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// ----------------------------------------------------------
// Voronoi cellular noise for texture variation
// ----------------------------------------------------------
float voronoi(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);

  float md = 5.0;
  vec2 mr;

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(i, j);
      vec2 o = 0.5 + 0.5 * sin(uTime * 0.1 + 6.2831 * vec2(
        noise2D(n + g + vec2(0.0, 0.0)),
        noise2D(n + g + vec2(1.0, 1.0))
      ));
      vec2 r = g + o - f;
      float d = dot(r, r);

      if (d < md) {
        md = d;
        mr = r;
      }
    }
  }

  return md;
}

// ----------------------------------------------------------
// Circuit board pattern
// ----------------------------------------------------------
float circuitPattern(vec2 uv, float time, float scale) {
  // Scale the UV coordinates
  vec2 scaledUV = uv * scale;

  // Get grid cell coordinates
  vec2 cell = floor(scaledUV);
  vec2 cellUV = fract(scaledUV);

  // Random value for this cell
  float cellRandom = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);

  // Create horizontal and vertical lines (circuit traces)
  float lineWidth = 0.05;
  float horizontalLine = smoothstep(0.0, lineWidth, abs(cellUV.y - 0.5));
  float verticalLine = smoothstep(0.0, lineWidth, abs(cellUV.x - 0.5));

  // Only draw some lines based on random value
  horizontalLine = mix(1.0, horizontalLine, step(0.4, cellRandom));
  verticalLine = mix(1.0, verticalLine, step(0.7, cellRandom));

  // Create connection nodes at some intersections
  float nodeSize = 0.15;
  float node = 0.0;

  // Only place nodes at some intersections
  if (cellRandom > 0.75) {
    // Distance from center of cell
    float dist = length(cellUV - 0.5);
    // Create circular node
    node = smoothstep(nodeSize, nodeSize - 0.05, dist);
  }

  // Create small components (squares, rectangles) in some cells
  float component = 0.0;
  if (cellRandom > 0.9) {
    // Small square component
    vec2 compUV = abs(cellUV - 0.5);
    float compSize = 0.2 + 0.1 * sin(time + cellRandom * 10.0);
    component = step(compSize, max(compUV.x, compUV.y));
  }

  // Add some small blinking LEDs
  float led = 0.0;
  if (cellRandom > 0.95) {
    float ledSize = 0.05;
    float dist = length(cellUV - vec2(0.7, 0.3));
    led = smoothstep(ledSize, ledSize - 0.02, dist);
    // Make LED blink
    led *= 0.5 + 0.5 * sin(time * (3.0 + cellRandom * 5.0));
  }

  // Combine all elements
  float circuit = min(horizontalLine * verticalLine, 1.0);
  circuit = min(circuit + node + component, 1.0);
  circuit = min(circuit + led * 2.0, 1.0); // LEDs are brighter

  // Animate some elements over time
  float pulseSpeed = 0.2;
  float pulse = 0.05 * sin(time * pulseSpeed + cellRandom * 10.0);

  return circuit + pulse;
}

void main() {
  // Normalize coords to [-1,1]
  vec2 uv = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;

  // Store original UV for circuit pattern
  vec2 originalUV = uv;

  // Zoom in so pattern is bigger and less obviously repeated
  uv *= float(${ZOOM_FACTOR});

  // Time factor for wave domain warp
  float t = uTime * float(${TIME_FACTOR});

  // Random amplitude that changes over time
  float waveAmp = float(${BASE_WAVE_AMPLITUDE}) + float(${RANDOM_WAVE_FACTOR})
                  * noise2D(vec2(t * 0.5, 27.7));

  // Sine-based domain warp
  float waveX = waveAmp * sin(uv.y * float(${WAVE_FREQUENCY}) + t);
  float waveY = waveAmp * sin(uv.x * float(${WAVE_FREQUENCY}) - t);
  uv.x += waveX;
  uv.y += waveY;

  // Additional swirl near center
  float r = length(uv);
  float angle = atan(uv.y, uv.x);
  float swirlStrength = float(${BASE_SWIRL_STRENGTH})
                        * (1.0 - smoothstep(0.0, 1.0, r));

  angle += swirlStrength * sin(uTime * 0.8 + r * float(${SWIRL_TIME_MULT}));
  uv = vec2(cos(angle), sin(angle)) * r;

  // Evaluate fractal noise
  float n = fbm(uv);

  // Add voronoi cellular texture for more variation
  float v = voronoi(uv * 3.0 + t * 0.2);
  n = mix(n, v, 0.3);

  // Additional swirl effect modulated by noise
  float swirlEffect = float(${NOISE_SWIRL_FACTOR})
                      * sin(t + n * 3.0);
  n += swirlEffect;

  // Convert noise to [0..1]
  float noiseVal = 0.5 * (n + 1.0);

  // Discrete palette sampling
  float idx = clamp(noiseVal, 0.0, 1.0) * float(NUM_COLORS - 1);
  int iLow = int(floor(idx));
  int iHigh = int(min(float(iLow + 1), float(NUM_COLORS - 1)));
  float f = fract(idx);

  vec3 colLow = cyberpunkColors[iLow];
  vec3 colHigh = cyberpunkColors[iHigh];
  vec3 color = mix(colLow, colHigh, f);

  // Add digital glow effect
  float glow = 0.5 * (1.0 - length(uv));
  color += vec3(0.0, 0.2, 0.5) * max(0.0, glow * glow);

  // Generate circuit pattern
  float circuit = circuitPattern(originalUV, t, float(${CIRCUIT_SCALE}));

  // Apply circuit pattern to darker areas
  vec3 circuitColor = vec3(0.0, 0.5, 1.0); // Cyan-blue circuit color
  float circuitVisibility = float(${CIRCUIT_INTENSITY}) * (1.0 - smoothstep(0.0, 0.5, length(color)));
  color = mix(color, color + circuitColor * circuit, circuitVisibility);

  // Add subtle pulsing to the neon colors
  float pulse = 0.1 * sin(t * 2.0);
  color *= 1.0 + pulse * max(0.0, length(color) - 0.5);

  // If it's the darkest color, set alpha=0 => total transparency
  if (iLow == 0 && iHigh == 0 && circuit < 0.1) {
    outColor = vec4(color, 0.0);
  } else {
    outColor = vec4(color, 1.0);
  }
}
`;
}

////////////////////////////////////////////////////////////////////////////////
// STATIC VERTEX SHADER
////////////////////////////////////////////////////////////////////////////////
const vertexShaderSource = `#version 300 es
precision mediump float;

in vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

////////////////////////////////////////////////////////////////////////////////
// SHADER COMPILATION UTIL
////////////////////////////////////////////////////////////////////////////////
function createShaderProgram(
    gl: WebGL2RenderingContext,
    vsSource: string,
    fsSource: string
): WebGLProgram | null {
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) return null;

    gl.shaderSource(vertexShader, vsSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        console.error("Vertex shader error:", gl.getShaderInfoLog(vertexShader));
        gl.deleteShader(vertexShader);
        return null;
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
        gl.deleteShader(vertexShader);
        return null;
    }

    gl.shaderSource(fragmentShader, fsSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        console.error(
            "Fragment shader error:",
            gl.getShaderInfoLog(fragmentShader)
        );
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return null;
    }

    const program = gl.createProgram();
    if (!program) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return null;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(
            "Could not link WebGL program:",
            gl.getProgramInfoLog(program)
        );
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteProgram(program);
        return null;
    }

    return program;
}

////////////////////////////////////////////////////////////////////////////////
// MAIN REACT COMPONENT
////////////////////////////////////////////////////////////////////////////////
export function AbstractPainting() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const animationFrameRef = useRef<number>(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Build final fragment shader from above config
        const fsSource = buildFragmentShader();

        const gl = canvas.getContext("webgl2", { alpha: true });
        if (!gl) {
            console.error("WebGL2 is not supported by your browser.");
            return;
        }

        // Enable blending for transparency
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Transparent background
        gl.clearColor(0, 0, 0, 0);

        // Resize canvas to fill screen
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const program = createShaderProgram(gl, vertexShaderSource, fsSource);
        if (!program) {
            console.error("Failed to create shader program.");
            return;
        }

        programRef.current = program;
        gl.useProgram(program); // Use program here, outside the render loop

        // Full-screen quad
        const quadVertices = new Float32Array([
            -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
        ]);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

        const aPositionLoc = gl.getAttribLocation(program, "aPosition");
        gl.enableVertexAttribArray(aPositionLoc);
        gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0);

        // Uniform locations
        const uResolutionLoc = gl.getUniformLocation(program, "uResolution");
        const uTimeLoc = gl.getUniformLocation(program, "uTime");

        const startTime = performance.now();

        function render() {
            const currentTime = performance.now();
            const elapsed = (currentTime - startTime) * 0.001; // seconds

            if (!canvas || !gl) return;

            if (
                canvas.width !== window.innerWidth ||
                canvas.height !== window.innerHeight
            ) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }

            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
            gl.uniform1f(uTimeLoc, elapsed);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            animationFrameRef.current = requestAnimationFrame(render);
        }

        render();

        // Listen for window resizing
        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
        };
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            cancelAnimationFrame(animationFrameRef.current);
            gl.deleteProgram(programRef.current);
            gl.deleteBuffer(vbo);
            gl.deleteVertexArray(vao);
        };
    }, []);

    return (
        <div className="h-full w-full bg-black">
            <canvas
                className="block h-full w-full"
                ref={canvasRef}
                style={{ background: "transparent" }}
            />
        </div>
    );
}

// "use client";

// import { useEffect, useRef } from "react";

// ////////////////////////////////////////////////////////////////////////////////
// // CONFIG SECTION (EASY-TO-EDIT VARIABLES)
// // Modified from the original to create a new artistic style
// ////////////////////////////////////////////////////////////////////////////////

// // Zoom factor for the visual pattern
// const ZOOM_FACTOR = 0.25;

// // Base wave amplitude in domain warping
// const BASE_WAVE_AMPLITUDE = 0.3;

// // Additional factor for random amplitude variations
// const RANDOM_WAVE_FACTOR = 0.2;

// // Frequency multiplier for wave domain warp
// const WAVE_FREQUENCY = 3.5;

// // Time speed factor (overall speed of animation)
// const TIME_FACTOR = 0.2;

// // Swirl strength near the center
// const BASE_SWIRL_STRENGTH = 1.5;

// // Finer swirl timing factor
// const SWIRL_TIME_MULT = 4.0;

// // Additional swirl effect modulated by noise
// const NOISE_SWIRL_FACTOR = 0.25;

// // Number of fractal noise octaves in fbm (must be integer)
// const FBM_OCTAVES = 8;

// // 20-step palette of jewel tones
// // Rich emeralds, sapphires, amethysts, and rubies
// const jewelColors = [
//   [0.05, 0.02, 0.1], // Deep purple-black
//   [0.1, 0.03, 0.2], // Dark amethyst
//   [0.15, 0.04, 0.3], // Rich purple
//   [0.2, 0.05, 0.4], // Bright amethyst
//   [0.1, 0.2, 0.4], // Deep sapphire
//   [0.0, 0.3, 0.6], // Rich sapphire
//   [0.0, 0.4, 0.7], // Bright sapphire
//   [0.0, 0.5, 0.5], // Teal
//   [0.0, 0.4, 0.3], // Deep emerald
//   [0.0, 0.5, 0.2], // Rich emerald
//   [0.1, 0.6, 0.3], // Bright emerald
//   [0.3, 0.6, 0.2], // Peridot
//   [0.5, 0.6, 0.0], // Chartreuse
//   [0.6, 0.5, 0.0], // Amber
//   [0.7, 0.4, 0.0], // Topaz
//   [0.8, 0.3, 0.0], // Amber-ruby transition
//   [0.7, 0.2, 0.1], // Deep ruby
//   [0.8, 0.1, 0.2], // Rich ruby
//   [0.9, 0.1, 0.3], // Bright ruby
//   [1.0, 0.2, 0.5], // Pink diamond
// ];

// ////////////////////////////////////////////////////////////////////////////////
// // DYNAMIC FRAGMENT SHADER BUILDER
// ////////////////////////////////////////////////////////////////////////////////

// function buildFragmentShader(): string {
//   // Force integer for the for-loop
//   const fbmOctavesInt = Math.floor(FBM_OCTAVES);

//   // Convert jewelColors array to GLSL array of vec3
//   const colorArraySrc = jewelColors
//     .map((c) => `vec3(${c[0]}, ${c[1]}, ${c[2]})`)
//     .join(",\n  ");

//   return `#version 300 es

// precision highp float;
// out vec4 outColor;

// uniform vec2 uResolution;
// uniform float uTime;

// #define NUM_COLORS 20

// // 20-step palette of jewel colors
// vec3 jewelColors[NUM_COLORS] = vec3[](
//   ${colorArraySrc}
// );

// // ----------------------------------------------------------
// // Perlin-like noise
// // ----------------------------------------------------------
// vec3 permute(vec3 x) {
//   return mod(((x * 34.0) + 1.0) * x, 289.0);
// }

// float noise2D(vec2 v) {
//   const vec4 C = vec4(
//     0.211324865405187,
//     0.366025403784439,
//     -0.577350269189626,
//     0.024390243902439
//   );

//   vec2 i = floor(v + dot(v, C.yy));
//   vec2 x0 = v - i + dot(i, C.xx);

//   vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
//   vec4 x12 = x0.xyxy + C.xxzz;
//   x12.xy -= i1;

//   i = mod(i, 289.0);
//   vec3 p = permute(
//     permute(i.y + vec3(0.0, i1.y, 1.0)) +
//     i.x + vec3(0.0, i1.x, 1.0)
//   );

//   vec3 m = max(
//     0.5 - vec3(
//       dot(x0, x0),
//       dot(x12.xy, x12.xy),
//       dot(x12.zw, x12.zw)
//     ),
//     0.0
//   );
//   m = m * m;
//   m = m * m;

//   vec3 x = 2.0 * fract(p * C.www) - 1.0;
//   vec3 h = abs(x) - 0.5;
//   vec3 ox = floor(x + 0.5);
//   vec3 a0 = x - ox;

//   m *= 1.792843 - 0.853734 * (a0 * a0 + h * h);

//   vec3 g;
//   g.x  = a0.x  * x0.x + h.x  * x0.y;
//   g.yz = a0.yz * x12.xz + h.yz * x12.yw;

//   return 130.0 * dot(m, g);
// }

// // ----------------------------------------------------------
// // Fractional Brownian Motion
// // ----------------------------------------------------------
// float fbm(vec2 st) {
//   float value = 0.0;
//   float amplitude = 0.5;
//   float freq = 1.0;
//   for (int i = 0; i < ${fbmOctavesInt}; i++) {
//     value += amplitude * noise2D(st * freq);
//     freq *= 2.0;
//     amplitude *= 0.5;
//   }
//   return value;
// }

// // ----------------------------------------------------------
// // Voronoi cellular noise for texture variation
// // ----------------------------------------------------------
// float voronoi(vec2 p) {
//   vec2 n = floor(p);
//   vec2 f = fract(p);

//   float md = 5.0;
//   vec2 mr;

//   for (int j = -1; j <= 1; j++) {
//     for (int i = -1; i <= 1; i++) {
//       vec2 g = vec2(i, j);
//       vec2 o = 0.5 + 0.5 * sin(uTime * 0.1 + 6.2831 * vec2(
//         noise2D(n + g + vec2(0.0, 0.0)),
//         noise2D(n + g + vec2(1.0, 1.0))
//       ));
//       vec2 r = g + o - f;
//       float d = dot(r, r);

//       if (d < md) {
//         md = d;
//         mr = r;
//       }
//     }
//   }

//   return md;
// }

// void main() {
//   // Normalize coords to [-1,1]
//   vec2 uv = (gl_FragCoord.xy / uResolution.xy) * 2.0 - 1.0;
//   uv.x *= uResolution.x / uResolution.y;

//   // Zoom in so pattern is bigger and less obviously repeated
//   uv *= float(${ZOOM_FACTOR});

//   // Time factor for wave domain warp
//   float t = uTime * float(${TIME_FACTOR});

//   // Random amplitude that changes over time
//   float waveAmp = float(${BASE_WAVE_AMPLITUDE}) + float(${RANDOM_WAVE_FACTOR})
//                   * noise2D(vec2(t * 0.5, 27.7));

//   // Sine-based domain warp
//   float waveX = waveAmp * sin(uv.y * float(${WAVE_FREQUENCY}) + t);
//   float waveY = waveAmp * sin(uv.x * float(${WAVE_FREQUENCY}) - t);
//   uv.x += waveX;
//   uv.y += waveY;

//   // Additional swirl near center
//   float r = length(uv);
//   float angle = atan(uv.y, uv.x);
//   float swirlStrength = float(${BASE_SWIRL_STRENGTH})
//                         * (1.0 - smoothstep(0.0, 1.0, r));

//   angle += swirlStrength * sin(uTime * 0.8 + r * float(${SWIRL_TIME_MULT}));
//   uv = vec2(cos(angle), sin(angle)) * r;

//   // Evaluate fractal noise
//   float n = fbm(uv);

//   // Add voronoi cellular texture for more variation
//   float v = voronoi(uv * 3.0 + t * 0.2);
//   n = mix(n, v, 0.3);

//   // Additional swirl effect modulated by noise
//   float swirlEffect = float(${NOISE_SWIRL_FACTOR})
//                       * sin(t + n * 3.0);
//   n += swirlEffect;

//   // Convert noise to [0..1]
//   float noiseVal = 0.5 * (n + 1.0);

//   // Discrete palette sampling
//   float idx = clamp(noiseVal, 0.0, 1.0) * float(NUM_COLORS - 1);
//   int iLow = int(floor(idx));
//   int iHigh = int(min(float(iLow + 1), float(NUM_COLORS - 1)));
//   float f = fract(idx);

//   vec3 colLow = jewelColors[iLow];
//   vec3 colHigh = jewelColors[iHigh];
//   vec3 color = mix(colLow, colHigh, f);

//   // Add subtle glow effect
//   float glow = 0.5 * (1.0 - length(uv));
//   color += vec3(0.2, 0.05, 0.3) * max(0.0, glow);

//   // If it's the darkest color, set alpha=0 => total transparency
//   if (iLow == 0 && iHigh == 0) {
//     outColor = vec4(color, 0.0);
//   } else {
//     outColor = vec4(color, 1.0);
//   }
// }
// `;
// }

// ////////////////////////////////////////////////////////////////////////////////
// // STATIC VERTEX SHADER
// ////////////////////////////////////////////////////////////////////////////////
// const vertexShaderSource = `#version 300 es
// precision mediump float;

// in vec2 aPosition;

// void main() {
//   gl_Position = vec4(aPosition, 0.0, 1.0);
// }`;

// ////////////////////////////////////////////////////////////////////////////////
// // SHADER COMPILATION UTIL
// ////////////////////////////////////////////////////////////////////////////////
// function createShaderProgram(
//   gl: WebGL2RenderingContext,
//   vsSource: string,
//   fsSource: string
// ): WebGLProgram | null {
//   const vertexShader = gl.createShader(gl.VERTEX_SHADER);
//   if (!vertexShader) return null;

//   gl.shaderSource(vertexShader, vsSource);
//   gl.compileShader(vertexShader);
//   if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
//     console.error("Vertex shader error:", gl.getShaderInfoLog(vertexShader));
//     gl.deleteShader(vertexShader);
//     return null;
//   }

//   const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
//   if (!fragmentShader) {
//     gl.deleteShader(vertexShader);
//     return null;
//   }

//   gl.shaderSource(fragmentShader, fsSource);
//   gl.compileShader(fragmentShader);
//   if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
//     console.error(
//       "Fragment shader error:",
//       gl.getShaderInfoLog(fragmentShader)
//     );
//     gl.deleteShader(vertexShader);
//     gl.deleteShader(fragmentShader);
//     return null;
//   }

//   const program = gl.createProgram();
//   if (!program) {
//     gl.deleteShader(vertexShader);
//     gl.deleteShader(fragmentShader);
//     return null;
//   }

//   gl.attachShader(program, vertexShader);
//   gl.attachShader(program, fragmentShader);
//   gl.linkProgram(program);

//   if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
//     console.error(
//       "Could not link WebGL program:",
//       gl.getProgramInfoLog(program)
//     );
//     gl.deleteShader(vertexShader);
//     gl.deleteShader(fragmentShader);
//     gl.deleteProgram(program);
//     return null;
//   }

//   return program;
// }

// ////////////////////////////////////////////////////////////////////////////////
// // MAIN REACT COMPONENT
// ////////////////////////////////////////////////////////////////////////////////
// export function AbstractPainting() {
//   const canvasRef = useRef<HTMLCanvasElement>(null);

//   useEffect(() => {
//     const canvas = canvasRef.current;
//     if (!canvas) return;

//     // Build final fragment shader from above config
//     const fsSource = buildFragmentShader();

//     const gl = canvas.getContext("webgl2", { alpha: true });
//     if (!gl) {
//       console.error("WebGL2 is not supported by your browser.");
//       return;
//     }

//     // Enable blending for transparency
//     gl.enable(gl.BLEND);
//     gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

//     // Transparent background
//     gl.clearColor(0, 0, 0, 0);

//     // Resize canvas to fill screen
//     canvas.width = window.innerWidth;
//     canvas.height = window.innerHeight;

//     const program = createShaderProgram(gl, vertexShaderSource, fsSource);
//     if (!program) {
//       console.error("Failed to create shader program.");
//       return;
//     }

//     gl.useProgram(program);

//     // Full-screen quad
//     const quadVertices = new Float32Array([
//       -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
//     ]);

//     const vao = gl.createVertexArray();
//     gl.bindVertexArray(vao);

//     const vbo = gl.createBuffer();
//     gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
//     gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

//     const aPositionLoc = gl.getAttribLocation(program, "aPosition");
//     gl.enableVertexAttribArray(aPositionLoc);
//     gl.vertexAttribPointer(aPositionLoc, 2, gl.FLOAT, false, 0, 0);

//     // Uniform locations
//     const uResolutionLoc = gl.getUniformLocation(program, "uResolution");
//     const uTimeLoc = gl.getUniformLocation(program, "uTime");

//     gl.useProgram(program); // Use program here, outside render

//     const startTime = performance.now();

//     function render() {
//       const currentTime = performance.now();
//       const elapsed = (currentTime - startTime) * 0.001; // seconds

//       if (
//         canvas.width !== window.innerWidth ||
//         canvas.height !== window.innerHeight
//       ) {
//         canvas.width = window.innerWidth;
//         canvas.height = window.innerHeight;
//       }

//       gl.viewport(0, 0, canvas.width, canvas.height);
//       gl.clear(gl.COLOR_BUFFER_BIT);

//       gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
//       gl.uniform1f(uTimeLoc, elapsed);

//       gl.drawArrays(gl.TRIANGLES, 0, 6);
//       requestAnimationFrame(render);
//     }
//     render();

//     // Listen for window resizing
//     const handleResize = () => {
//       canvas.width = window.innerWidth;
//       canvas.height = window.innerHeight;
//       gl.viewport(0, 0, canvas.width, canvas.height);
//     };
//     window.addEventListener("resize", handleResize);

//     return () => {
//       window.removeEventListener("resize", handleResize);
//       gl.deleteProgram(program);
//       gl.deleteBuffer(vbo);
//       gl.deleteVertexArray(vao);
//     };
//   }, []);

//   return (
//     <canvas
//       ref={canvasRef}
//       className="w-full h-full block"
//       style={{ background: "transparent" }}
//     />
//   );
// }
