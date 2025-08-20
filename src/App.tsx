import React, { Fragment, useState, useCallback } from 'react';
import './App.css'
import { useRef } from 'react';
import { mat3, vec2 } from 'gl-matrix';

function generateRandomWalkData(length: number, startValue: number = 50): { x: number, y: number }[] {
  const data: { x: number, y: number }[] = [];
  let currentY = startValue;
  
  // Start from current timestamp and increment by microseconds for high frequency data
  const startTimestamp = 0;
  const microsecondsIncrement = 100; // 100 microseconds between data points (10kHz)
  
  for (let i = 0; i < length; i++) {
    currentY = Math.max(1, currentY + (Math.random() - 0.5) * 5);
    data.push({ x: startTimestamp + (i * microsecondsIncrement / 1000), y: currentY });
  }
  
  return data;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function makeCachedCtxOp<T>() {
  let value: T | null = null;

  return (v, fn: (v: T) => void) => {
    if(v === value) return;
    value = v;
    fn(v);
  }
}

class Flamegraph {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  view: [number,number,number,number]
  domain: [number, number, number, number]
  data: { x: number, y: number }[]

  viewMatrix = mat3.create()
  chartViewMatrix = mat3.create()

  projectionMatrix = mat3.create();
  viewProjectionMatrix = mat3.create()
  originMatrix = mat3.create()
  physicalSpaceMatrix = mat3.create()

  padding: {
    x: number
    y: number
  } = {
    x: 0,
    y: 0,
  }

  textRenderer: TextRenderer
  textMeasurer: TextMeasurer
  gridRenderer: GridRenderer

  resizeObserver: ResizeObserver

  ctxOps: {
    strokeStyle: (v: string, fn: (v: string) => void) => void
    lineWidth: (v: number, fn: (v: number) => void) => void
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    if(!this.ctx) throw new Error('Failed to get canvas context');

    this.ctxOps = {
      strokeStyle: makeCachedCtxOp<string>(),
      lineWidth: makeCachedCtxOp<number>(),
    }

    this.textRenderer = new TextRenderer(this.ctx);
    this.textMeasurer = new TextMeasurer(this.ctx);
    this.gridRenderer = new GridRenderer(this.ctx);

    this.data = generateRandomWalkData(10 * 1e6);

    let maxY = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;

    for(let i = 0; i < this.data.length; i++) {
      maxY = Math.max(maxY, this.data[i].y);
      minY = Math.min(minY, this.data[i].y);
    }

    let minX = this.data[0].x;
    let maxX = this.data[this.data.length - 1].x;

    this.view = [minX, minY, maxX - minX, maxY - minY];
    this.domain = [minX, minY, maxX - minX, maxY - minY];

    this.originMatrix = mat3.identity(this.originMatrix);

    this.viewMatrix = mat3.fromValues(
      this.domain[2] / this.view[2], 0, 0,
      0, this.domain[3] / this.view[3], 0,
      -(this.view[0] * this.domain[2] / this.view[2]), -(this.view[1] * this.domain[3] / this.view[3]), 1,
    );

    this.chartViewMatrix = mat3.fromValues( 
      this.domain[2] / this.view[2], 0, 0,
      0, this.domain[3] / this.view[3], 0,
      0, 0, 1,
    );

    this.physicalSpaceMatrix = mat3.fromValues(
      window.devicePixelRatio, 0, 0,
      0, window.devicePixelRatio, 0,
      0, 0, 1,
    );

    this.setupResizeObserver();
  }

  setupResizeObserver = () => {
    this.resizeObserver = new ResizeObserver((entries) => {
      if(!this.canvas) return;

      const rect = entries[0].contentRect;

      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;

      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;

      this.projectionMatrix = mat3.fromValues(
        (rect.width - 2 * this.padding.x) / this.domain[2], 0, 0,
        0, -(rect.height - 2 * this.padding.y) / this.domain[3], 0,
        0, 0, 1,
      );

      this.originMatrix = mat3.fromValues(
        1, 0, 0,
        0, 1, 0,
        this.padding.x, rect.height - this.padding.y, 1,
      );

      this.projectionMatrix = mat3.multiply(this.projectionMatrix, this.originMatrix, this.projectionMatrix);
      this.projectionMatrix = mat3.multiply(this.projectionMatrix, this.physicalSpaceMatrix, this.projectionMatrix);

      this.viewProjectionMatrix = mat3.multiply(this.viewMatrix, this.projectionMatrix, this.viewMatrix);
      this.chartViewMatrix = mat3.multiply(this.chartViewMatrix, this.projectionMatrix, this.chartViewMatrix);

      this.render();
    });

    this.resizeObserver.observe(this.canvas!.parentElement);
  }

  transformView(mat: mat3) {
    this.view = [
      this.view[0] * mat[0] + this.view[1] * mat[3] + mat[6],
      this.view[0] * mat[1] + this.view[1] * mat[4] + mat[7],
      this.view[2] * mat[0] + this.view[3] * mat[3],
      this.view[2] * mat[1] + this.view[3] * mat[4],
    ]

    this.view = this.clampView(this.view);

    this.viewMatrix = mat3.fromValues(
      this.domain[2] / this.view[2], 0, 0,
      0, this.domain[3] / this.view[3], 0,
      -(this.view[0] * this.domain[2] / this.view[2]), -(this.view[1] * this.domain[3] / this.view[3]), 1,
    );

    this.viewProjectionMatrix = mat3.multiply(this.viewMatrix, this.projectionMatrix, this.viewMatrix);
  }

  setView(view: [number, number, number, number]) {
    this.view = this.clampView(view);

    this.viewMatrix = mat3.fromValues(
      this.domain[2] / this.view[2], 0, 0,
      0, this.domain[3] / this.view[3], 0,
      -(this.view[0] * this.domain[2] / this.view[2]), -(this.view[1] * this.domain[3] / this.view[3]), 1,
    );

    this.viewProjectionMatrix = mat3.multiply(this.viewMatrix, this.projectionMatrix, this.viewMatrix);
  }

  clampView(view: [number, number, number, number]): [number, number, number, number] {
    return [
      clamp(view[0], this.domain[0], this.domain[2] - view[2]),
      clamp(view[1], this.domain[1], this.domain[3] - view[3]),
      clamp(view[2], 1, this.domain[2]),
      clamp(view[3], 1, this.domain[3]),
    ];
  }

  getCursorPosition(x: number, y: number): vec2 | null {
    if(!this.ctx || !this.canvas) return null;

    x *= window.devicePixelRatio;
    y *= window.devicePixelRatio;

    const unproject = mat3.invert(mat3.create(), this.viewProjectionMatrix);
    const vecInLogicalSpace = vec2.fromValues(x, y);

    vec2.transformMat3(vecInLogicalSpace, vecInLogicalSpace, unproject);

    return vecInLogicalSpace;
  }

  renderAxisGrid() {
    if (!this.ctx || !this.canvas) return;
    this.ctxOps.strokeStyle('black', (v) => this.ctx!.strokeStyle = v);
    this.ctxOps.lineWidth(1 * window.devicePixelRatio, (v) => this.ctx!.lineWidth = v);

     // render the X and Y axis
     this.ctxOps.strokeStyle('black', (v) => this.ctx!.strokeStyle = v);
     this.ctxOps.lineWidth(1 * window.devicePixelRatio, (v) => this.ctx!.lineWidth = v);
 
     const origin = vec2.fromValues(0,0)
     const xEnd = vec2.fromValues(this.domain[2], 0)
     const yEnd = vec2.fromValues(0, this.domain[3])
 
     const originScreen = vec2.transformMat3(vec2.create(), origin, this.chartViewMatrix)
     const xEndScreen = vec2.transformMat3(vec2.create(), xEnd, this.chartViewMatrix)
     const yEndScreen = vec2.transformMat3(vec2.create(), yEnd, this.chartViewMatrix)
 
     this.ctx.beginPath();
     this.ctx.moveTo(originScreen[0], originScreen[1]);
     this.ctx.lineTo(xEndScreen[0], xEndScreen[1]);
     this.ctx.stroke();
 
     this.ctx.beginPath();
     this.ctx.moveTo(originScreen[0], originScreen[1]);
     this.ctx.lineTo(yEndScreen[0], yEndScreen[1]);
     this.ctx.stroke();
  }

  rafId: number | null = null;
  
  render() {
    typeof this.rafId === 'number' && window.cancelAnimationFrame(this.rafId);

    this.rafId = requestAnimationFrame(() => {
      if (!this.ctx || !this.canvas) return;

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      if (this.data.length === 0) return;

      const inverse = mat3.invert(mat3.create(), this.viewProjectionMatrix);
      const pxInConfigSpace = vec2.fromValues(1 * inverse[0], 1 * -inverse[4]);

      this.renderAxisGrid();
        
      const origin = vec2.fromValues(0,0)
      const xEnd = vec2.fromValues(this.domain[2], 0)
      const yEnd = vec2.fromValues(0, this.domain[3])

      const originScreen = vec2.transformMat3(vec2.create(), origin, this.chartViewMatrix)
      const xEndScreen = vec2.transformMat3(vec2.create(), xEnd, this.chartViewMatrix)
      const yEndScreen = vec2.transformMat3(vec2.create(), yEnd, this.chartViewMatrix)
      
      this.ctx.beginPath();
      this.ctx.rect(originScreen[0], originScreen[1], xEndScreen[0] - originScreen[0], yEndScreen[1] - originScreen[1]);
      this.ctx.clip();
      
      const min = Math.max(0, binarySearchIndex(this.data, this.view[0]) - 1);
      const max = Math.min(this.data.length, binarySearchIndex(this.data, this.view[0] + this.view[2]) + 1);

      this.ctxOps.lineWidth(1 * window.devicePixelRatio, (v) => this.ctx!.lineWidth = v);
      this.ctxOps.strokeStyle('blue', (v) => this.ctx!.strokeStyle = v);
      this.ctx.beginPath();

      for(let i = min; i < max; i++) {
        let x = this.data[i].x;
        let maxY = this.data[i].y;

        let e = i;

        while(e < max && this.data[e].x - this.data[i].x <= pxInConfigSpace[0]) {
          if (this.data[e].y > maxY) {
            maxY = this.data[e].y;
          }
          e++;
        }
        
        let y = maxY;

        let xConfig = this.viewProjectionMatrix[6] + this.viewProjectionMatrix[0] * x;
        let yConfig = this.viewProjectionMatrix[7] + this.viewProjectionMatrix[4] * y; 
        this.ctx.lineTo(xConfig, yConfig);

        i = e - 1;
      }

      this.ctx.stroke();
    });
  }

  dispose() {
    this.canvas = null;
    this.ctx = null;

    this.resizeObserver.disconnect();

    if(typeof this.rafId === 'number'){
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

class GridRenderer {
  ctx: CanvasRenderingContext2D
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }
  
  render() {
    this.ctx.strokeStyle = 'black';
    this.ctx.lineWidth = 1 * window.devicePixelRatio;
  }
}

class TextRenderer {
  ctx: CanvasRenderingContext2D
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  render(text: string, x: number, y: number) {
    this.ctx.fillStyle = 'black';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(text, x, y);
  }
}

class TextMeasurer {
  ctx: CanvasRenderingContext2D
  cache: Map<string, number>

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.cache = new Map();
  }
  
  measure(text: string) {
    if(this.cache.has(text)) return this.cache.get(text);
    const metrics = this.ctx.measureText(text);
    this.cache.set(text, metrics.width);
    return metrics.width;
  }
}

function binarySearchIndex(data: { x: number, y: number }[], x: number) {
  let low = 0;
  let high = data.length - 1;
  while(low <= high) {
    // Prevent potential overflow in mid calculation
    const mid = low + Math.floor((high - low) / 2);
    if(data[mid].x === x) return mid;
    if(data[mid].x < x) low = mid + 1;
    else high = mid - 1;
  }
  return low;
}

function App() {
  const flamegraph = useRef<Flamegraph | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);

  document.body.style.overscrollBehavior = 'none';

  const canvasCallbackRef = useCallback((canvas: HTMLCanvasElement) => {
    if (canvas) {
      flamegraph.current = new Flamegraph(canvas);

      canvas.addEventListener('wheel', (e) => {
        if(!flamegraph.current) return;
        
        if(e.metaKey || e.shiftKey) {
          const rect = e.currentTarget.getBoundingClientRect();
          const cursorPosition = flamegraph.current.getCursorPosition(e.clientX - rect.left, e.clientY - rect.top);
          if(!cursorPosition) return;

          const xCenter = cursorPosition[0];
          const yCenter = cursorPosition[1];
          const centerScale = mat3.create();

          mat3.multiply(centerScale, centerScale, mat3.fromValues(
            1, 0, 0,
            0, 1, 0,
            xCenter, yCenter, 1,
          ));

          const scaleFactor = 1 + e.deltaY * 0.005;
          mat3.multiply(centerScale, centerScale, mat3.fromValues(
            scaleFactor, 0, 0,
            0, e.shiftKey ? 1 : scaleFactor, 0,
            0, 0, 1,
          ));

          mat3.multiply(centerScale, centerScale, mat3.fromValues(
            1, 0, 0,
            0, 1, 0,
            -xCenter, -yCenter, 1,
          ));

          flamegraph.current.transformView(centerScale);
          flamegraph.current.render();
        } else {
          const physicalDelta = vec2.fromValues(e.deltaX * 0.005, e.deltaY * 0.005);
          const physicalToConfig = mat3.invert(
            mat3.create(),
            flamegraph.current.viewProjectionMatrix
          );
          const [m00, m01, m02, m10, m11, m12] = physicalToConfig;

          const configDelta = vec2.transformMat3(vec2.create(), physicalDelta, [
            m00!,
            m01!,
            m02!,
            m10!,
            m11!,
            m12!,
            0,
            0,
            0,
          ]);

          flamegraph.current.transformView(mat3.fromTranslation(mat3.create(), configDelta));

          const shouldCheckLeft = e.deltaX < 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY);
          const shouldCheckRight = e.deltaX > 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY);

          if(shouldCheckLeft){
            const firstLeft = binarySearchIndex(flamegraph.current.data, flamegraph.current.view[0]);
            const leftY = flamegraph.current.data[firstLeft].y;
            if(leftY < flamegraph.current.view[1]){
              // left is below view
              flamegraph.current.setView([flamegraph.current.view[0], leftY, flamegraph.current.view[2], flamegraph.current.view[3]]);
            } else if(
              leftY > flamegraph.current.view[1] + flamegraph.current.view[3]
            ){
              // left is above view
              flamegraph.current.setView([flamegraph.current.view[0], leftY - flamegraph.current.view[3], flamegraph.current.view[2], flamegraph.current.view[3]]);
            }
          } else if(shouldCheckRight){
            const firstRight = binarySearchIndex(flamegraph.current.data, flamegraph.current.view[0] + flamegraph.current.view[2]); 
            const rightY = flamegraph.current.data[firstRight].y;
            if(rightY > flamegraph.current.view[1] + flamegraph.current.view[3]){
              // right is above view
              flamegraph.current.setView([flamegraph.current.view[0], rightY - flamegraph.current.view[3], flamegraph.current.view[2], flamegraph.current.view[3]]);
            } else if(rightY < flamegraph.current.view[1]){
              // right is below view
              flamegraph.current.setView([flamegraph.current.view[0], rightY, flamegraph.current.view[2], flamegraph.current.view[3]]);
            }
          }
          flamegraph.current.render();
        }

        if(viewRef.current) {
          viewRef.current.innerText = `View: ${flamegraph.current?.view.map(v => v.toFixed(1)).join(', ')}
          Domain: ${flamegraph.current?.domain.map(v => v.toFixed(1)).join(', ')}`;
        }
      });
    }
    else flamegraph.current?.dispose();
  }, []);

  const onCanvasMouseMove = (e) => {
    if(!flamegraph.current || !cursorRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const position = flamegraph.current.getCursorPosition(e.clientX - rect.left, e.clientY - rect.top);
    if(!position) cursorRef.current.innerText = 'Cursor: <failed to compute>';
    else cursorRef.current.innerText = `Cursor: ${position[0].toFixed(1)}, ${position[1].toFixed(1)}`;
  }

  const onCanvasMouseLeave = () => {
    if(!cursorRef.current) return;
    cursorRef.current.innerText = 'Cursor: <outside>';
  }

  const startPosition = React.useRef<vec2 | null>(null);
  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if(!flamegraph.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    startPosition.current = flamegraph.current.getCursorPosition(e.clientX - rect.left, e.clientY - rect.top);
  }

  const onCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if(!flamegraph.current) return;
    if(!startPosition.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos1 = startPosition.current;
    const pos2 = flamegraph.current.getCursorPosition(e.clientX - rect.left, e.clientY - rect.top);

    if (!pos1 || !pos2) return;

    // Compute the min/max window between the two points
    const x0 = Math.min(pos1[0], pos2[0]);
    const y0 = Math.min(pos1[1], pos2[1]);
    const x1 = Math.max(pos1[0], pos2[0]);
    const y1 = Math.max(pos1[1], pos2[1]);

    flamegraph.current.setView([
      x0,
      y0,
      x1 - x0,
      y1 - y0,
    ]);

    flamegraph.current.render();
    startPosition.current = null;
  }

  if(viewRef.current) {
    viewRef.current.innerText = `View: ${flamegraph.current?.view.map(v => v.toFixed(1)).join(', ')}
    domain: ${flamegraph.current?.domain.map(v => v.toFixed(1)).join(', ')}`;
  }

  const [_, rerender] = useState(0);

  return (
    <Fragment>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        width: '700px',
        height: '400px',
        overscrollBehavior: 'none',
        marginBottom: 64,
      }}>
      <canvas 
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
        }}
        ref={canvasCallbackRef} 
        onMouseMove={onCanvasMouseMove} 
        onMouseLeave={onCanvasMouseLeave}
        onMouseDown={onCanvasMouseDown}
        onMouseUp={onCanvasMouseUp}
        />
      </div>
      <button onClick={() => {
        if(!flamegraph.current) return;
        flamegraph.current.transformView(mat3.fromValues(
          1, 0, 0,
          0, 1, 0,
          1, 0, 1,
        ));
        flamegraph.current.render();
        rerender((prev) => prev + 1);
      }}>
        +x
      </button>
      <button onClick={() => {
        if(!flamegraph.current) return;
        flamegraph.current.transformView(mat3.fromValues(
          1, 0, 0,
          0, 1, 0,
          -1, 0, 1,
        ));
        flamegraph.current.render();
        rerender((prev) => prev + 1);
      }}>-x</button>
      <button onClick={() => {
        if(!flamegraph.current) return;
        flamegraph.current.transformView(mat3.fromValues(
          1, 0, 0,
          0, 1, 0,
          0, 1, 1,
        ));
        flamegraph.current.render();
        rerender((prev) => prev + 1);
      }}>+y</button>

      <button onClick={() => {
        if(!flamegraph.current) return;
        flamegraph.current.transformView(mat3.fromValues(
          1, 0, 0,
          0, 1, 0,
          0, -1, 1,
        ));
        flamegraph.current.render();
        rerender((prev) => prev + 1);
      }}>-y</button>

      <button onClick={() => {
        if(!flamegraph.current) return;
        const centerScale = mat3.create();

        const xCenter = flamegraph.current.view[0] + flamegraph.current.view[2] / 2;
        const yCenter = flamegraph.current.view[1] + flamegraph.current.view[3] / 2;

        mat3.multiply(centerScale, centerScale, mat3.fromValues(
          1, 0, 0,
          0, 1, 0,
          xCenter, yCenter, 1,
        ));
        
        mat3.multiply(centerScale, centerScale, mat3.fromValues(
          0.9, 0, 0,
          0, 1, 0,
          0, 0, 1,
        ));

        mat3.multiply(centerScale, centerScale, mat3.fromValues(
          1, 0, 0,
          0, 1, 0,
          -xCenter, -yCenter, 1,
        ));

        flamegraph.current.transformView(centerScale);
        flamegraph.current.render();
        rerender((prev) => prev + 1);
      }}>+ scale x</button>

      <button onClick={() => {
        if(!flamegraph.current) return;
        const centerScale = mat3.create();

        const xCenter = flamegraph.current.view[0] + flamegraph.current.view[2] / 2;
        const yCenter = flamegraph.current.view[1] + flamegraph.current.view[3] / 2;

        mat3.multiply(centerScale, centerScale, mat3.fromValues(
          1, 0, 0,
          0, 1, 0,
          xCenter, yCenter, 1,
        ));

        mat3.multiply(centerScale, centerScale, mat3.fromValues(
          1.1, 0, 0,
          0, 1, 0,
          0, 0, 1,
        ));

        mat3.multiply(centerScale, centerScale, mat3.fromValues(
          1, 0, 0,
          0, 1, 0,
          -xCenter, -yCenter, 1,
        ));

        flamegraph.current.transformView(centerScale);
        flamegraph.current.render();
        rerender((prev) => prev + 1);
      }}>- scale x</button>
      
      
      <div style={{
        position:'fixed',
        top:0,
        right:0,
        height:'auto',
        backgroundColor:'black',
        fontSize:'12px',
        color:'white',
        fontFamily:'monospace',
        textAlign:'right',
        whiteSpace:'nowrap',
        padding: 8,
        }}>
          Debug Tools:
          <div ref={cursorRef}/>
          <div ref={viewRef}/>
      </div>
    </Fragment>

  )
}

export default App
