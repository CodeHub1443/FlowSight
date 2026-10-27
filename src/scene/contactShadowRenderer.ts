import {
  Color,
  Mesh,
  MeshBasicMaterial,
  MeshDepthMaterial,
  OrthographicCamera,
  PlaneGeometry,
  ShaderMaterial,
  WebGLRenderTarget,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

// Contact shadows: the scene's depth seen from below the floor, tinted and blurred twice (the technique of drei's
// <ContactShadows>), as a plain class so <ContactShadowLayer/> can render it on demand. The blur passes use their own
// full-screen quad and camera (the shadow camera cannot see a quad at its own origin).

export interface ContactShadowOptions {
  width: number;
  depth: number;
  /** Height above the plane that still casts. */
  far: number;
  color: string;
  opacity: number;
  blur: number;
  resolution: number;
}

function blurMaterial(shader: typeof HorizontalBlurShader | typeof VerticalBlurShader) {
  const uniforms = {
    tDiffuse: { value: null as Texture | null },
    h: { value: 0 },
    v: { value: 0 },
  };
  const material = new ShaderMaterial({
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    uniforms,
    depthTest: false,
  });
  return { material, uniforms };
}

export class ContactShadowRenderer {
  /** Floor plane geometry (three XZ) and its material showing the shadow texture. */
  readonly plane: PlaneGeometry;
  readonly material: MeshBasicMaterial;
  private readonly target: WebGLRenderTarget;
  private readonly targetBlur: WebGLRenderTarget;
  /** Full-screen quad and camera for the blur passes. */
  private readonly blurQuad: Mesh;
  private readonly blurCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly depthMaterial: MeshDepthMaterial;
  private readonly hBlur = blurMaterial(HorizontalBlurShader);
  private readonly vBlur = blurMaterial(VerticalBlurShader);
  private readonly camera: OrthographicCamera;
  private readonly blur: number;

  constructor(o: ContactShadowOptions) {
    this.target = new WebGLRenderTarget(o.resolution, o.resolution);
    this.targetBlur = new WebGLRenderTarget(o.resolution, o.resolution);
    this.target.texture.generateMipmaps = this.targetBlur.texture.generateMipmaps = false;
    this.plane = new PlaneGeometry(o.width, o.depth).rotateX(Math.PI / 2);
    this.blurQuad = new Mesh(new PlaneGeometry(2, 2));
    this.blurQuad.position.z = -0.5;
    this.depthMaterial = new MeshDepthMaterial({ depthTest: false, depthWrite: false });
    const tint = new Color(o.color);
    this.depthMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.ucolor = { value: tint };
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', 'uniform vec3 ucolor;\nvoid main() {')
        .replace(
          'vec4( vec3( 1.0 - fragCoordZ ), opacity );',
          'vec4( ucolor * fragCoordZ * 2.0, ( 1.0 - fragCoordZ ) * 1.0 );',
        );
    };
    this.depthMaterial.customProgramCacheKey = () => 'scene-contact-depth';
    this.camera = new OrthographicCamera(
      -o.width / 2,
      o.width / 2,
      o.depth / 2,
      -o.depth / 2,
      0,
      o.far,
    );
    // its world matrix is copied from the holder each render; the renderer must not recompute it from position
    this.camera.matrixWorldAutoUpdate = false;
    this.material = new MeshBasicMaterial({
      map: this.target.texture,
      transparent: true,
      opacity: o.opacity,
      depthWrite: false,
    });
    this.blur = o.blur;
  }

  private blurPass(gl: WebGLRenderer, amount: number): void {
    const { blurQuad, hBlur, vBlur, blurCamera } = this;
    blurQuad.material = hBlur.material;
    hBlur.uniforms.tDiffuse.value = this.target.texture;
    hBlur.uniforms.h.value = amount / 256;
    gl.setRenderTarget(this.targetBlur);
    gl.render(blurQuad, blurCamera);
    blurQuad.material = vBlur.material;
    vBlur.uniforms.tDiffuse.value = this.targetBlur.texture;
    vBlur.uniforms.v.value = amount / 256;
    gl.setRenderTarget(this.target);
    gl.render(blurQuad, blurCamera);
  }

  /**
   * Render the shadow texture. `holder` is the object carrying the visible plane: its world matrix is the shadow
   * camera's (local -Z pointing up) and it is hidden while the scene is captured.
   */
  render(gl: WebGLRenderer, scene: Scene, holder: Object3D): void {
    const background = scene.background;
    const override = scene.overrideMaterial;
    holder.visible = false;
    scene.background = null;
    scene.overrideMaterial = this.depthMaterial;
    holder.updateWorldMatrix(true, false);
    this.camera.matrixWorld.copy(holder.matrixWorld);
    this.camera.matrixWorldInverse.copy(holder.matrixWorld).invert();
    gl.setRenderTarget(this.target);
    gl.clear();
    gl.render(scene, this.camera);
    this.blurPass(gl, this.blur);
    this.blurPass(gl, this.blur * 0.4);
    gl.setRenderTarget(null);
    holder.visible = true;
    scene.overrideMaterial = override;
    scene.background = background;
  }

  dispose(): void {
    this.target.dispose();
    this.targetBlur.dispose();
    this.plane.dispose();
    this.blurQuad.geometry.dispose();
    this.depthMaterial.dispose();
    this.hBlur.material.dispose();
    this.vBlur.material.dispose();
    this.material.dispose();
  }
}
