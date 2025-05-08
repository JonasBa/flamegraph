import React, { Fragment } from 'react';
import './App.css'
import { useRef } from 'react';

const trace = [
  {
    start: 0,
    duration: 400
  },
]


function mat3mul(a: number[], b: number[]): number[] {
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

class Flamegraph {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    canvas.width = 600 * window.devicePixelRatio;
    canvas.height = 400 * window.devicePixelRatio;

    canvas.style.width = '600px';
    canvas.style.height = '400px';

    this.render();
  }

  dispose() {
    this.canvas = null;
    this.ctx = null;
  }

  render() {
    if (!this.ctx || !this.canvas) {
      return;
    }
    
    const canvasMatrix = [
      600, 0, 0,
      0, 400, 0,
      0, 0, 1,
    ]

    const traceMatrix = [
      400, 0, 0,
      0, 1, 0, 
      0, 0, 1,
    ]

    const timeToCanvas = [
      canvasMatrix[0] / traceMatrix[0] , 0, 0,
      0, 400, 0,
      0, 0, 1,
    ]

    const dprMatrix = [
      window.devicePixelRatio, 0, 0,
      0, window.devicePixelRatio, 0,
      0, 0, 1,
    ]

    const timeToCanvasDPR = mat3mul(timeToCanvas, dprMatrix);

    for(const span of trace) {
      this.ctx.fillStyle = 'red';

      const x = timeToCanvasDPR[0] * span.start;
      const width = timeToCanvasDPR[0] * span.duration;

      this.ctx.fillRect(x, 0, width, 10 * dprMatrix[4]);
    }
  }
}


function App() {
  const flamegraph = useRef<Flamegraph | null>(null);

  function callbackRef(canvas) {
    if (canvas) {
      flamegraph.current = new Flamegraph(canvas);
    } else {
      flamegraph.current?.dispose();
    }
  }

  return (
    <Fragment>
      <canvas ref={callbackRef} style={{border: '1px solid gray'}}></canvas>
      <div style={{
        position:'fixed',
        top:0,
        right:0,
        width:'100px',
        height:'auto',
        backgroundColor:'black',
        fontSize:'12px',
        color:'white',
        fontFamily:'monospace',
        padding: 8,
        }}>
          Debug things
      </div>
    </Fragment>

  )
}

export default App
