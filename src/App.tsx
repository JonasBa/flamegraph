import React, { Fragment } from 'react';
import './App.css'
import { useRef } from 'react';
import { mat3 } from 'gl-matrix';

const trace = [
  {
    depth: 0,
    start: 0,
    duration: 100
  },
  {
    depth: 1,
    start: 0,
    duration: 50
  },
]
class Flamegraph {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  // view: x,y,width,height
  view: [number,number,number,number]
  trace: [number, number, number, number]

  viewMatrix: mat3;
  projectionMatrix: mat3;
  mvpMatrix: mat3;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    canvas.width = 600 * window.devicePixelRatio;
    canvas.height = 400 * window.devicePixelRatio;

    canvas.style.width = '600px';
    canvas.style.height = '400px';

    // Denotes x, y, width, height
    this.view = [0, 0, 100, 400/20];
    this.trace = [0, 0, 100, 2];

    this.viewMatrix = mat3.fromValues(
      this.trace[2] / this.view[2], 0, 0,
      0, 1, 0,
      this.view[0] * this.trace[2] / this.view[2], this.view[1] * this.trace[3] / this.view[3], 1,
    );

    this.projectionMatrix = mat3.fromValues(
      600 / this.trace[2] * window.devicePixelRatio, 0, 0,
      0, this.view[3] * window.devicePixelRatio, 0,
      0, 0, 1,
    );

    this.mvpMatrix = mat3.multiply(mat3.create(), this.projectionMatrix, this.viewMatrix);
    this.render();
  }

  getCursorPosition(x: number, y: number): [number, number] | null {
    if(!this.ctx || !this.canvas) return null;

    // Convert to same coordinate system as the canvas
    x *= window.devicePixelRatio;
    y *= window.devicePixelRatio;

    const unproject = mat3.invert(mat3.create(), this.mvpMatrix);

    return[
      (unproject[0] * x - unproject[6]),
      (unproject[4] * y - unproject[7])
    ]
  }
  

  render() {
    if (!this.ctx || !this.canvas) {
      return;
    }

    for(let i = 0; i < trace.length; i++) {
      const span = trace[i];
      this.ctx.fillStyle = i % 2 === 0 ? 'red' : 'blue';

      const x = this.mvpMatrix[6] + this.mvpMatrix[0] * span.start;
      const y = span.depth * this.mvpMatrix[4];
      const width = this.mvpMatrix[0] * span.duration;
      const height = this.mvpMatrix[4];

      this.ctx.fillRect(x, y, width, height);
    }
  }

  dispose() {
    this.canvas = null;
    this.ctx = null;
  }
}


function App() {
  const flamegraph = useRef<Flamegraph | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);

  function canvasCallbackRef(canvas) {
    if (canvas) flamegraph.current = new Flamegraph(canvas);
    else flamegraph.current?.dispose();
  }

  const onCanvasMouseMove = (e) => {
    if(!flamegraph.current || !cursorRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const position = flamegraph.current.getCursorPosition(e.clientX - rect.left, e.clientY - rect.top);
    if(!position) cursorRef.current.innerText = 'Cursor: <failed to compute>';
    else cursorRef.current.innerText = `Cursor: ${position[0].toFixed(2)}, ${position[1].toFixed(2)}`;
  }

  const onCanvasMouseLeave = () => {

    if(!cursorRef.current) return;
    cursorRef.current.innerText = 'Cursor: <outside>';
  }

  if(viewRef.current) {
    viewRef.current.innerText = `View: ${flamegraph.current?.view.map(v => v.toFixed(2)).join(', ')}`;
  }

  return (
    <Fragment>
      <canvas 
        ref={canvasCallbackRef} 
        onMouseMove={onCanvasMouseMove} 
        onMouseLeave={onCanvasMouseLeave}
        style={{border: '1px solid gray'}}>
      </canvas>
      <div style={{
        position:'fixed',
        top:0,
        right:0,
        width:'240px',
        height:'auto',
        backgroundColor:'black',
        fontSize:'12px',
        color:'white',
        fontFamily:'monospace',
        textAlign:'right',
        padding: 8,
        }}>
          Debug things
          <div ref={cursorRef}/>
          <div ref={viewRef}/>
      </div>
    </Fragment>

  )
}

export default App
