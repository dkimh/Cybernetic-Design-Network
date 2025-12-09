import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

// Create shader
const GradientOrbMaterialImpl = shaderMaterial(
    {
        color1: new THREE.Color('#ffffff'),
        color2: new THREE.Color('#000000'),
        color3: new THREE.Color('#000000'),
        intensity: 1.0,
    },
    // Vertex Shader
    `
    varying vec3 vNormal;

    void main() {
      vNormal = normal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    // Fragment Shader
    `
    varying vec3 vNormal;

    uniform vec3 color1;
    uniform vec3 color2;
    uniform vec3 color3;
    uniform float intensity;

    void main() {
      float n = dot(normalize(vNormal), vec3(0.2, 0.8, 0.4));
      n = smoothstep(-1.0, 1.0, n);

      vec3 grad = mix(color2, color1, n);

      float r = smoothstep(0.0, 1.0,
        dot(normalize(vNormal), vec3(-0.3, 0.3, -0.8))
      );

      grad = mix(grad, color3, r * 0.6);
      grad *= intensity;

      gl_FragColor = vec4(grad, 1.0);
    }
  `
);

// Register as JSX component <gradientOrbMaterial />
extend({ GradientOrbMaterial: GradientOrbMaterialImpl });

// TypeScript JSX mapping
declare global {
    namespace JSX {
        interface IntrinsicElements {
            gradientOrbMaterial: JSX.IntrinsicElements['shaderMaterial'];
        }
    }
}

export { GradientOrbMaterialImpl as GradientOrbMaterial };
