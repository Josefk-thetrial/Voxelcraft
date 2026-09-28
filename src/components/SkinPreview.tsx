import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { animatePlayerModel, createPlayerModel, disposePlayerModel } from '../game/PlayerModel';
import type { SkinProfile } from '../game/skin';

export default function SkinPreview({ profile, walking }: { profile: SkinProfile; walking: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const animate = useRef(walking);
  animate.current = walking;
  const [error, setError] = useState(false);
  useEffect(() => {
    const container = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch { setError(true); return; }
    setError(false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
    camera.position.set(2.7, 1.9, 5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8798aa, 2.3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(3, 5, 5); scene.add(light);
    const model = createPlayerModel(profile);
    scene.add(model.group);
    const resize = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height; camera.updateProjectionMatrix();
    });
    resize.observe(container);
    let last = performance.now();
    const phase = { value: 0 };
    renderer.setAnimationLoop(now => {
      animatePlayerModel(model, animate.current ? 3 : 0, Math.min((now - last) / 1000, 0.05), phase);
      last = now; controls.update(); renderer.render(scene, camera);
    });
    return () => {
      renderer.setAnimationLoop(null); resize.disconnect(); controls.dispose();
      disposePlayerModel(model); renderer.dispose(); renderer.domElement.remove();
    };
  }, [profile]);
  return <div className="skin-preview" ref={host} role="img" aria-label="Prévia 3D da skin. Arraste para girar e use a roda para aproximar.">{error && <p>Prévia 3D indisponível. Você ainda pode importar e salvar sua skin.</p>}</div>;
}
