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

    const canvas = [
      600, 0, 0,
      0, 400, 0,
      0, 0, 1,
    ]

    const time = [
      100, 0, 0,
      0, 1, 0, 
      0, 0, 1,
    ]

    const timeToCanvas = [
      canvas[0] / time[0] , 0, 0,
      0, 400, 0,
      0, 0, 1,
    ]

    const rectangles = [
      [0, 50]
    ]

    for(const rect of rectangles) {
      this.ctx.fillStyle = 'red';

      const x = timeToCanvas[0] * rect[0];
      const width = timeToCanvas[0] * rect[1];

      this.ctx.fillRect(0, 0, width, 10);
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
      <canvas ref={callbackRef}></canvas>
  )
}

export default App
