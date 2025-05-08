import React, { Fragment } from 'react';
import './App.css'
import { useRef } from 'react';

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


type Mat3 = [number, number, number, number, number, number, number, number, number];
function mat3mul(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ]
}

function inverseMat3(a: Mat3): Mat3 | null { 
  const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  if(det === 0) return null;
  const invDet = 1 / det;
  return [
    (a[4] * a[8] - a[5] * a[7]) * invDet,
    (a[2] * a[7] - a[1] * a[8]) * invDet,
    (a[1] * a[5] - a[2] * a[4]) * invDet,

    (a[3] * a[8] - a[5] * a[6]) * invDet,
    (a[0] * a[8] - a[2] * a[6]) * invDet,
    (a[2] * a[3] - a[0] * a[5]) * invDet,

    (a[3] * a[7] - a[4] * a[6]) * invDet,
    (a[1] * a[6] - a[0] * a[7]) * invDet,
    (a[0] * a[4] - a[1] * a[3]) * invDet,
  ]
}
  


class Flamegraph {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;

  canvasMatrix: Mat3;
  traceMatrix: Mat3;
  viewMatrix: Mat3;
  traceToCanvas: Mat3;
  dprMatrix: Mat3;
  timeToCanvasDPR: Mat3;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    canvas.width = 600 * window.devicePixelRatio;
    canvas.height = 400 * window.devicePixelRatio;

    canvas.style.width = '600px';
    canvas.style.height = '400px';

    this.canvasMatrix = [
      600, 0, 0,
      0, 400, 0,
      0, 0, 1,
    ]

    this.traceMatrix = [
      100, 0, 0,
      0, 1, 0, 
      0, 0, 1,
    ]

    this.viewMatrix = [
      100, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]

    const viewToTrace = [
      this.traceMatrix[0] * this.viewMatrix[0] / this.traceMatrix[0], 0, 0,
      0, this.traceMatrix[1] * this.viewMatrix[1] / this.traceMatrix[1], 0,
      0, 0, 1,
    ]

    this.traceToCanvas = [
      this.canvasMatrix[0] / viewToTrace[0] , 0, 0,
      0, 400, 0,
      0, 0, 1,
    ]

    this.dprMatrix = [
      window.devicePixelRatio, 0, 0,
      0, window.devicePixelRatio, 0,
      0, 0, 1,
    ]

    this.timeToCanvasDPR = mat3mul(this.traceToCanvas, this.dprMatrix);
    this.render();
  }

  getCursorPosition(x: number, y: number): [number, number] | null {
    if(!this.ctx || !this.canvas) return null;

    const inverseCanvasMatrix = inverseMat3(this.timeToCanvasDPR);
    
    if(!inverseCanvasMatrix) return null;
    const inverseSpace = mat3mul(inverseCanvasMatrix, this.dprMatrix);

    return [
      (inverseSpace[0] * x + inverseSpace[1] * y + inverseSpace[2]),
      (inverseSpace[3] * x + inverseSpace[4] * y + inverseSpace[5])
    ]
  }
  

  render() {
    if (!this.ctx || !this.canvas) {
      return;
    }

    for(let i = 0; i < trace.length; i++) {
      const span = trace[i];
      this.ctx.fillStyle = i % 2 === 0 ? 'red' : 'blue';

      const x = this.timeToCanvasDPR[0] * span.start;
      const y = span.depth * 10 * this.dprMatrix[4];
      const width = this.timeToCanvasDPR[0] * span.duration;
      const height = 10 * this.dprMatrix[4];

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

  function callbackRef(canvas) {
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

  return (
    <Fragment>
      <canvas 
        ref={callbackRef} 
        onMouseMove={onCanvasMouseMove} 
        onMouseLeave={onCanvasMouseLeave}
        style={{border: '1px solid gray'}}>
      </canvas>
      <div style={{
        position:'fixed',
        top:0,
        right:0,
        width:'200px',
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
      </div>
    </Fragment>

  )
}

export default App
