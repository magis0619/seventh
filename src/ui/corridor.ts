import type { TowerDef } from '../data/dungeons';
import type { Enemy } from '../core/types';

/**
 * 1人称通路（Canvas 2D の疑似3D）。消失点に向かう台形を重ねて描く。
 */
export class Corridor {
  private ctx: CanvasRenderingContext2D;
  private palette: TowerDef['palette'];
  private offset = 0;
  private enemy: Enemy | null = null;
  private enemyHurt = 0;
  private fountain = false;
  private raf = 0;

  constructor(private canvas: HTMLCanvasElement, tower: TowerDef) {
    this.ctx = canvas.getContext('2d')!;
    this.palette = tower.palette;
  }

  setEnemy(e: Enemy | null) {
    this.enemy = e;
    this.draw();
  }

  setFountain(v: boolean) {
    this.fountain = v;
    this.draw();
  }

  /** 「進む」の通路が手前に流れるアニメ */
  playMove(ms: number): Promise<void> {
    cancelAnimationFrame(this.raf);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / ms);
        this.offset = k;
        this.draw();
        if (k < 1) this.raf = requestAnimationFrame(step);
        else {
          this.offset = 0;
          this.draw();
          resolve();
        }
      };
      this.raf = requestAnimationFrame(step);
    });
  }

  hurtEnemy() {
    this.enemyHurt = 1;
    const t0 = performance.now();
    const step = (t: number) => {
      this.enemyHurt = Math.max(0, 1 - (t - t0) / 250);
      this.draw();
      if (this.enemyHurt > 0) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
  }

  draw() {
    const { ctx, canvas, palette: p } = this;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H * 0.48;
    ctx.fillStyle = p.fog;
    ctx.fillRect(0, 0, W, H);

    // 奥行き d (0=手前, 1=消失点) の矩形
    const rect = (d: number) => {
      const s = 1 - d;
      const hw = (W / 2) * s;
      const hh = (H / 2) * s;
      return { l: cx - hw, r: cx + hw, t: cy - hh * 0.96, b: cy + hh * 1.08 };
    };
    const far = rect(0.92);
    const near = rect(0);

    // 天井・床・壁の台形
    const poly = (pts: number[][], color: string) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    poly([[near.l, near.t], [near.r, near.t], [far.r, far.t], [far.l, far.t]], p.ceil);
    poly([[near.l, near.b], [near.r, near.b], [far.r, far.b], [far.l, far.b]], p.floor);
    poly([[near.l, near.t], [far.l, far.t], [far.l, far.b], [near.l, near.b]], p.wall);
    poly([[near.r, near.t], [far.r, far.t], [far.r, far.b], [near.r, near.b]], p.wall);

    // 奥へ向かう区切り線（offset で手前に流れる）
    ctx.strokeStyle = p.line;
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      const u = (i + 1 - this.offset) / segs; // 0..1
      const dd = Math.pow(u, 1.8) * 0.92;
      const rr = rect(dd);
      ctx.globalAlpha = 0.15 + 0.6 * (1 - dd);
      ctx.lineWidth = 1 + 2 * (1 - dd);
      ctx.strokeRect(rr.l, rr.t, rr.r - rr.l, rr.b - rr.t);
    }
    ctx.globalAlpha = 1;
    // 消失点への稜線
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (const [x0, y0, x1, y1] of [
      [near.l, near.t, far.l, far.t],
      [near.r, near.t, far.r, far.t],
      [near.l, near.b, far.l, far.b],
      [near.r, near.b, far.r, far.b],
    ]) {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 奥の闇
    ctx.fillStyle = '#000';
    ctx.fillRect(far.l, far.t, far.r - far.l, far.b - far.t);

    if (this.fountain) this.drawFountain(cx, cy + H * 0.18);
    if (this.enemy) this.drawEnemy(cx, cy, W, H, this.enemy);
  }

  private drawFountain(x: number, y: number) {
    const ctx = this.ctx;
    ctx.fillStyle = '#556';
    ctx.beginPath();
    ctx.ellipse(x, y, 70, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(x, y - 30, 4, x, y - 30, 70);
    g.addColorStop(0, '#9ef');
    g.addColorStop(1, '#9ef0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - 20, 50, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6cf';
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 56, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawEnemy(cx: number, cy: number, W: number, H: number, e: Enemy) {
    const ctx = this.ctx;
    const hue = (e.name.charCodeAt(0) * 37) % 360;
    const size = (e.isBoss ? 0.3 : 0.17) * Math.min(W, H) * 1.4;
    const shake = this.enemyHurt * 8;
    const x = cx + (Math.random() - 0.5) * shake;
    const y = cy + H * 0.08 + (Math.random() - 0.5) * shake;
    const body = e.isBoss ? `hsl(${hue}, 70%, 38%)` : `hsl(${hue}, 55%, 45%)`;
    // 影
    ctx.fillStyle = '#0008';
    ctx.beginPath();
    ctx.ellipse(x, y + size * 0.95, size * 0.9, size * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    // 胴体（ボスはトゲ付き）
    ctx.fillStyle = this.enemyHurt > 0.5 ? '#fff' : body;
    ctx.beginPath();
    if (e.isBoss) {
      const n = 14;
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? size : size * 0.82;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9);
      }
    } else {
      ctx.ellipse(x, y, size, size * 0.85, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    if (e.isBoss) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // 目
    const eyeY = y - size * 0.15;
    const eyeDx = size * 0.35;
    const eyeR = size * (e.isBoss ? 0.16 : 0.2);
    for (const dx of [-eyeDx, eyeDx]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x + dx, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.isBoss ? '#d00' : '#111';
      ctx.beginPath();
      ctx.arc(x + dx, eyeY + eyeR * 0.15, eyeR * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.isBoss) {
      // 第三の目
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(x, eyeY - size * 0.35, eyeR * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d00';
      ctx.beginPath();
      ctx.arc(x, eyeY - size * 0.35, eyeR * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
