"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface TranscriptSceneLine {
  side: "caller" | "ring0";
  label: string;
  text: string;
}

function CableScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    const clock = new THREE.Clock();

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    camera.position.set(0, 0, 7);

    const cableMaterial = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
    const pulseMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, -0.2, 0),
      new THREE.Vector3(-1.3, 0.8, 0.3),
      new THREE.Vector3(1.1, -0.65, -0.2),
      new THREE.Vector3(3.2, 0.2, 0),
    ]);

    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.045, 12, false), cableMaterial);
    scene.add(cable);

    const pulses = Array.from({ length: 8 }, (_, index) => {
      const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 20), pulseMaterial);
      pulse.userData.offset = index / 8;
      scene.add(pulse);
      return pulse;
    });

    const handleResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    window.addEventListener("resize", handleResize);

    let animationFrame = 0;

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      cable.rotation.z = Math.sin(elapsed * 0.7) * 0.035;
      pulses.forEach((pulse) => {
        const progress = (elapsed * 0.18 + pulse.userData.offset) % 1;
        pulse.position.copy(curve.getPoint(progress));
        pulse.scale.setScalar(0.55 + Math.sin((progress + elapsed) * Math.PI * 2) * 0.22);
      });

      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="call-scene__cable" ref={mountRef} aria-hidden="true" />;
}

interface CallTranscriptSceneProps {
  lines?: TranscriptSceneLine[];
  loading?: boolean;
}

export function CallTranscriptScene({ lines = [], loading = false }: CallTranscriptSceneProps) {
  const hasLines = lines.length > 0;

  return (
    <div className="call-scene">
      <div className="call-scene__stage" aria-label="Live call transcript visualization">
        <div className="phone phone--caller">
          <div className="phone__speaker" />
          <div className="phone__screen">
            <span>Scammer</span>
            <strong>+1 unknown</strong>
            <p>Voice stream detected</p>
          </div>
        </div>

        <CableScene />

        <div className="phone phone--ring0">
          <div className="phone__speaker" />
          <div className="phone__screen">
            <span>Protected phone</span>
            <strong>Ring0 active</strong>
            <p>AI is answering</p>
          </div>
        </div>

        {hasLines ? (
          <div className="transcript-stream">
            {lines.map((line, index) => (
              <article className={`transcript-line transcript-line--${line.side}`} key={`${line.side}-${index}-${line.text}`} style={{ animationDelay: `${index * 0.18}s` }}>
                <span>{line.label}</span>
                <p>{line.text}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="transcript-loading">{loading ? "Loading live transcript..." : "Waiting for transcript..."}</div>
        )}
      </div>
    </div>
  );
}
