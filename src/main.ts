import './style.css';
import { Game } from './ui/game';

const game = new Game(document.getElementById('app')!, document.getElementById('debug')!);
game.render();
// デバッグ用にコンソールから触れるようにする
(window as unknown as { game: Game }).game = game;
