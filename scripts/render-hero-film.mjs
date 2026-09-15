import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
// Local, deterministic cloth animation. No remote rendering service or client data.
await mkdir("work/hero-film", { recursive: true });
await mkdir("public/video", { recursive: true });
const room = (await readFile("public/images/concept-living.webp")).toString(
  "base64",
);
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
  });
  await page.setContent('<canvas width="1280" height="1000"></canvas>');
  const result = await page.evaluate(async (room) => {
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl", {
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL unavailable");
    const vertex =
      "attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}";
    const fragment = `precision highp float;
  varying vec2 uv; uniform float time; uniform sampler2D room;
  float wave(float x,float y,float t){return sin(x*70.+sin(y*2.8+t*.65)*.5)*.72+sin(x*141.+y*.8-t*.4)*.18;}
  void main(){
   float t=time; float cycle=t/12.;
   float opening=smoothstep(.0,.26,cycle)*(1.-smoothstep(.79,1.,cycle));
   float side=uv.x<.5?0.:1.; float x=side==0.?uv.x:1.-uv.x;
   float edge=mix(.509,.015,opening)+sin(uv.y*3.5+t*.5)*.014*opening;
   float clothX=x/max(edge,.01)*.5;
   float fold=wave(clothX,uv.y,t);
   float grad=(wave(clothX+.0008,uv.y,t)-fold)/.0008;
   vec3 normal=normalize(vec3(-grad*.053,.06,1.));
   vec3 light=normalize(vec3(-.55,.25,1.));
   float diffuse=max(dot(normal,light),0.);
   float sheen=pow(max(dot(normal,normalize(light+vec3(0,0,1))),0.),22.);
   float weave=sin(gl_FragCoord.x*2.7)*sin(gl_FragCoord.y*2.9)*.01;
   vec3 fabric=vec3(.56,.53,.42)*(.35+.69*diffuse)+vec3(.35,.31,.22)*sheen+weave;
   fabric*=.84+.16*uv.y;
   float zoom=1.+.032*sin(cycle*3.14159);
   vec2 roomUV=(uv-.5)/zoom+.5;
   roomUV.x=(roomUV.x-.5)*.72+.5;
   roomUV.y=1.-roomUV.y;
   vec3 background=texture2D(room,roomUV).rgb;
   float shadow=1.-.22*exp(-max(x-edge,0.)*42.)*opening;
   background*=shadow;
   float mask=1.-smoothstep(edge-.001,edge+.001,x);
   vec3 color=mix(background,fabric,mask);
   gl_FragColor=vec4(color,1.);
  }`;
    const program = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const pos = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const img = new Image();
    img.src = "data:image/webp;base64," + room;
    await img.decode();
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    const time = gl.getUniformLocation(program, "time");
    const draw = (t) => {
      gl.uniform1f(time, t);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    draw(0);
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp9",
      videoBitsPerSecond: 5000000,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start();
    const start = performance.now();
    await new Promise((resolve) => {
      function frame(now) {
        draw(Math.min((now - start) / 1000, 12));
        if (now - start < 12000) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    recorder.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: "video/webm" });
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(blob);
    });
  }, room);
  await writeFile(
    "work/hero-film/curtain-reveal.webm",
    Buffer.from(result, "base64"),
  );
} finally {
  await browser.close();
}
await new Promise((resolve, reject) => {
  const p = spawn(
    "ffmpeg",
    [
      "-y",
      "-i",
      "work/hero-film/curtain-reveal.webm",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "25",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-r",
      "30",
      "public/video/curtain-reveal.mp4",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let err = "";
  p.stderr.on("data", (d) => (err += d));
  p.on("exit", (c) => (c ? reject(new Error(err)) : resolve()));
});
console.log(
  "Created public/video/curtain-reveal.mp4 (12-second local cloth animation)",
);
