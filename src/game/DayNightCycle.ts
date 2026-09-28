import * as THREE from 'three';

export type DayPhase = 'Amanhecer' | 'Dia' | 'Entardecer' | 'Noite';

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

/** Controla céu, névoa, sol, lua e estrelas em um ciclo de quatro minutos. */
export class DayNightCycle {
  private time = 0.42; // manhã avançada
  private readonly cycleSeconds = 240;
  private sun: THREE.DirectionalLight;
  private moon: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private stars: THREE.Points;
  private fog: THREE.Fog;

  constructor(scene: THREE.Scene, fog: THREE.Fog, shadowSize = 1024) {
    this.fog = fog;
    this.sky = this.createSky();
    this.stars = this.createStars();
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x31422a, 0.9);

    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.camera.left = -42;
    this.sun.shadow.camera.right = 42;
    this.sun.shadow.camera.top = 42;
    this.sun.shadow.camera.bottom = -42;
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 180;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;

    this.moon = new THREE.DirectionalLight(0x7799dd, 0.18);
    scene.add(this.sky, this.stars, this.hemi, this.sun, this.sun.target, this.moon, this.moon.target);
  }

  private createSky(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        horizonColor: { value: this.fog.color },
        topColor: { value: new THREE.Color(0x2f7fd0) },
        midColor: { value: new THREE.Color(0x8ec6ee) },
        botColor: { value: new THREE.Color(0xc8e0ef) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 topColor, midColor, botColor, horizonColor;
        void main() {
          float h = normalize(vDir).y;
          vec3 color = h > 0.0
            ? mix(midColor, topColor, pow(smoothstep(0.0, 0.65, h), 0.8))
            : mix(midColor, botColor, smoothstep(0.0, 0.35, -h));
          // Match distant terrain/water to the lower sky, hiding the streaming edge.
          color = mix(horizonColor, color, smoothstep(0.0, 0.22, max(h, 0.0)));
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 12), material);
    mesh.frustumCulled = false;
    return mesh;
  }

  private createStars(): THREE.Points {
    const positions: number[] = [];
    let seed = 8451;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 420; i++) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(1 - random());
      const radius = 320;
      positions.push(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.cos(phi) * radius,
        Math.sin(phi) * Math.sin(theta) * radius,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xe8efff, size: 1.1, sizeAttenuation: true, transparent: true }),
    );
    points.frustumCulled = false;
    return points;
  }

  update(dt: number, player: THREE.Vector3): void {
    this.time = (this.time + dt / this.cycleSeconds) % 1;
    const angle = (this.time - 0.25) * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const day = smoothstep(-0.16, 0.22, sunHeight);
    const horizon = 1 - smoothstep(0.02, 0.38, Math.abs(sunHeight));
    const radius = 95;

    const sx = Math.cos(angle) * radius;
    const sy = sunHeight * radius;
    this.sun.position.set(player.x + sx, player.y + sy, player.z + 28);
    this.sun.target.position.copy(player);
    this.sun.target.updateMatrixWorld();
    this.sun.intensity = day * 1.65;

    this.moon.position.set(player.x - sx, player.y - sy, player.z - 28);
    this.moon.target.position.copy(player);
    this.moon.target.updateMatrixWorld();
    this.moon.intensity = (1 - day) * 0.24;
    this.hemi.intensity = 0.1 + day * 0.82;

    const nightTop = new THREE.Color(0x030712);
    const dayTop = new THREE.Color(0x2f7fd0);
    const nightMid = new THREE.Color(0x0c1730);
    const dayMid = new THREE.Color(0x8ec6ee);
    const dusk = new THREE.Color(0xf28a52);
    const nightBottom = new THREE.Color(0x111a2b);
    const dayBottom = new THREE.Color(0xc8e0ef);
    const uniforms = this.sky.material.uniforms;
    uniforms.topColor.value.copy(nightTop).lerp(dayTop, day);
    uniforms.midColor.value.copy(nightMid).lerp(dayMid, day).lerp(dusk, horizon * 0.72);
    uniforms.botColor.value.copy(nightBottom).lerp(dayBottom, day).lerp(dusk, horizon * 0.5);
    this.fog.color.copy(nightMid).lerp(new THREE.Color(0xc8e0ef), day).lerp(dusk, horizon * 0.24);

    this.sky.visible = player.y > -100;
    this.sky.position.copy(player);
    this.stars.position.copy(player);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.pow(1 - day, 1.6);
    this.stars.visible = day < 0.92 && player.y > -100;
  }

  /** Fração do ciclo [0,1) — usada pelo sistema de save. */
  get timeOfDay(): number {
    return this.time;
  }

  setTime(fraction: number): void {
    this.time = ((fraction % 1) + 1) % 1;
  }

  /** Noite = sol abaixo do horizonte (fase dos zumbis). */
  get isNight(): boolean {
    const angle = (this.time - 0.25) * Math.PI * 2;
    return Math.sin(angle) < -0.1;
  }

  get clock(): string {
    const totalMinutes = Math.floor(this.time * 24 * 60);
    const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  get phase(): DayPhase {
    if (this.time >= 0.22 && this.time < 0.31) return 'Amanhecer';
    if (this.time >= 0.31 && this.time < 0.72) return 'Dia';
    if (this.time >= 0.72 && this.time < 0.81) return 'Entardecer';
    return 'Noite';
  }

  dispose(): void {
    this.sun.shadow.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
  }
}