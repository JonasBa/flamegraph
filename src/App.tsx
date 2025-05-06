import React from 'react';
import './App.css'
import { useRef } from 'react';


class Flamegraph {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    canvas.width = 600;
    canvas.height = 400;
  }

  dispose() {
    this.canvas = null;
    this.ctx = null;
  }

  render() {
    if (!this.ctx || !this.canvas) {
      return;
    }

    this.ctx.fillStyle = 'red';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
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
      <canvas ref={callbackRef}></canvas>
  )
}

export default App
