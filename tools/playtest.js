// 回归测试：在浏览器中（页面已加载 dist/index.html）执行，自动通关全部八座庭院。
// 用法：把整个函数作为 evaluate_script 的 function 参数运行，返回每座庭院的通关结果。
async () => {
  const app = window.__IG, T = window.__IGT;
  const G = () => app.game;
  const P = () => app.game.player;
  const start = async (i) => { app.action('goto', i); await T.wait(1100); app.mode = 'play'; T.step(30); };
  const fwd = (to, frames) => { T.lookAt(to); P().pitch = 0; T.key('KeyW', true); T.step(frames); T.key('KeyW', false); };
  const done = () => { T.step(10); return G().completed; };
  const results = {};

  // 1 初醒
  await start(0);
  T.walkTo([14.5, 16.85, 23.5]); T.lookAt([14.5, 18, 26]); T.step(1); T.ev('shift'); T.step(90);
  T.walkTo([28.5, 17, 25.15], 0.35, 1200); T.lookAt([28.5, 16, 22]); T.step(1); T.ev('shift'); T.step(90);
  T.walkTo([31.5, 16.85, 20], 0.2, 600);
  results['初醒'] = done();

  // 2 坠落
  await start(1);
  T.walkTo([29.5, 12.85, 19], 0.3, 900); fwd([40, 12.85, 19], 30); T.step(240);
  T.walkTo([35.5, 28.85, 19.5], 0.2, 600);
  results['坠落'] = done();

  // 3 方块
  await start(2);
  T.walkTo([11.5, 10.85, 13.5]); T.lookAt([11.5, 10.42, 11.5]); T.step(1); T.ev('interact'); T.step(5);
  T.walkTo([24.2, 10.85, 16.5]); T.lookAt([26.5, 10.3, 16.5]); T.step(3); T.ev('interact'); T.step(180);
  T.walkTo([20, 10.85, 19], 0.3); T.walkTo([20, 10.85, 24], 0.3); T.walkTo([12, 10.85, 29.5]);
  T.lookAt([12, 12.5, 32]); T.step(1); T.ev('shift'); T.step(90);
  T.walkTo([10.5, 13.8, 31.15], 0.3, 900); T.lookAt([10.5, 15.5, 31.58]); T.step(1); T.ev('interact'); T.step(5);
  T.walkTo([20.3, 13.5, 31.15], 0.3, 900); T.lookAt([22.5, 13.5, 31.7]); T.step(3); T.ev('interact'); T.step(60);
  T.lookAt([20.5, 10, 28]); T.step(1); T.ev('shift'); T.step(250);
  T.walkTo([27, 10.85, 26.5], 0.3); T.walkTo([31.5, 10.85, 26.5], 0.2);
  results['方块'] = done();

  // 4 回环
  await start(3);
  T.walkTo([18.5, 12.85, 17.5]); T.lookAt([18.5, 12.42, 19.5]); T.step(1); T.ev('interact'); T.step(5);
  T.walkTo([23.4, 12.85, 15.5], 0.15); T.lookAt([25.5, 13.2, 15.5]); T.step(20); T.ev('interact'); T.step(360);
  T.walkTo([17, 12.85, 13], 0.3); T.walkTo([12.5, 12.85, 13], 0.2);
  results['回环'] = done();

  // 5 悬停
  await start(4);
  T.walkTo([12, 10.85, 14]); T.lookAt([10, 12, 14]); T.step(1); T.ev('shift'); T.step(90);
  T.walkTo([10.85, 15.6, 14.5], 0.3, 900); T.lookAt([10.42, 17.5, 14.5]); T.step(1); T.ev('interact'); T.step(5);
  T.walkTo([10.85, 12.3, 21.3], 0.3, 900); T.lookAt([10.42, 10.5, 23.5]); T.step(3); T.ev('interact'); T.step(60);
  T.lookAt([13, 10, 21]); T.step(1); T.ev('shift'); T.step(100);
  T.walkTo([20.5, 10.85, 15.3]); T.lookAt([20.5, 10.42, 13.5]); T.step(1); T.ev('interact'); T.step(5);
  T.walkTo([10.85, 10.85, 21.8], 0.15); T.lookAt([10.85, 11.5, 30]); P().pitch = 0;
  T.key('KeyW', true); T.ev('jump'); T.step(40); T.ev('jump'); T.step(60); T.key('KeyW', false); T.step(20);
  T.walkTo([19.3, 12.85, 28.5], 0.3); T.lookAt([21.5, 12.4, 28.5]); T.step(3); T.ev('interact'); T.step(200);
  T.walkTo([21, 12.85, 26.2], 0.3); T.walkTo([25, 12.85, 28.5], 0.3); T.walkTo([29.5, 12.85, 28.5], 0.2);
  results['悬停'] = done();

  // 6 水
  await start(5);
  T.walkTo([11.5, 11.85, 25.3]); T.lookAt([11.5, 11.42, 27.5]); T.step(1); T.ev('interact'); T.step(5);
  T.walkTo([18.6, 11.85, 29.5], 0.15); T.lookAt([20.5, 11.2, 29.5]); T.step(20); T.ev('interact'); T.step(510);
  {
    const fr = G().cubes.list.filter((c) => c.fruit);
    const sockets = [[17.5, 11.42, 15.5], [22.5, 11.42, 15.5]];
    for (let i = 0; i < 2; i++) {
      const cp = fr[i].pos.slice();
      T.walkTo([cp[0] - 1.6, 11.85, cp[2] - 0.5 < 29.3 ? cp[2] : 29.2], 0.3);
      T.lookAt(cp); T.step(2); T.ev('interact'); T.step(5);
      const s = sockets[i];
      T.walkTo([s[0], 11.85, s[2] + 2.2], 0.3); T.lookAt(s); T.step(3); T.ev('interact'); T.step(40);
    }
  }
  T.step(200); T.walkTo([20, 11.85, 13], 0.3); T.walkTo([20, 11.85, 8.5], 0.2);
  results['水'] = done();

  // 7 倒悬
  await start(6);
  T.lookAt([14.5, 18, 21]); T.step(1); T.ev('shift'); T.step(100);
  T.walkTo([12.5, 17.15, 15.6], 0.3); T.lookAt([12.5, 17.58, 13.5]); T.step(1); T.ev('interact'); T.step(5);
  T.walkTo([19.5, 17.15, 20.5], 0.15); T.lookAt([21.5, 16.6, 20.5]); T.step(20); T.ev('interact'); T.step(400);
  fwd([30, 17.15, 20.5], 25); T.step(200);
  T.walkTo([24, 8.15, 16], 0.3); T.walkTo([28.5, 8.15, 16], 0.2);
  results['倒悬'] = done();

  // 8 庭院之心
  await start(7);
  T.walkTo([22.5, 12.85, 16.4]); T.lookAt([22.5, 12.42, 14.5]); T.step(1); T.ev('interact'); T.step(5);
  T.walkTo([26.5, 12.85, 21.5], 0.2); T.walkTo([27.4, 12.85, 19.45], 0.12);
  T.lookAt([27.5, 11.0, 18.5]); T.step(25); T.ev('interact'); T.step(500);
  P().pos = [31.2, 12.85, 15.5]; T.step(5); fwd([40, 12.85, 15.5], 30); T.step(220);
  let f = G().cubes.list.filter((c) => c.fruit && c.color === 3)[0];
  T.walkTo([f.pos[0] - 1.5, 34.85, f.pos[2] - 1.2], 0.25); T.lookAt(f.pos); T.step(2); T.ev('interact'); T.step(5);
  T.walkTo([28.6, 34.85, 17], 0.2); fwd([10, 34.85, 17], 30); T.step(200);
  T.walkTo([19.6, 12.85, 24.5], 0.2); T.lookAt([17.5, 12.42, 24.5]); T.step(3); T.ev('interact'); T.step(60);
  T.walkTo([12, 12.85, 37.4], 0.25); T.lookAt([12, 15, 40]); T.step(1); T.ev('shift'); T.step(90);
  T.walkTo([10.5, 16.6, 39.15], 0.3, 900); T.lookAt([10.5, 18.5, 39.58]); T.step(1); T.ev('interact'); T.step(5);
  T.walkTo([18.5, 24.0, 39.15], 0.15, 900); T.lookAt([18.5, 25.5, 40.7]); T.step(25); T.ev('interact'); T.step(540);
  f = G().cubes.list.filter((c) => c.fruit && c.color === 4)[1];
  T.walkTo([f.pos[0], f.pos[1] - 1.7, 39.15], 0.25, 900); T.lookAt(f.pos); T.step(2); T.ev('interact'); T.step(5);
  T.walkTo([27.5, 21.3, 39.15], 0.25, 900); T.lookAt([27.5, 19.5, 39.58]); T.step(3); T.ev('interact'); T.step(60);
  T.walkTo([29.8, 21.3, 39.15], 0.25, 900); T.walkTo([29.8, 14, 39.15], 0.3, 900);
  T.lookAt([29.8, 12, 36]); T.step(1); T.ev('shift'); T.step(100);
  T.walkTo([27.5, 12.85, 28.5], 0.25); T.lookAt([27.5, 19, 28.0]); T.step(1); T.ev('shift'); T.step(100);
  T.walkTo([27.5, 18.15, 24.6], 0.25); T.lookAt([27.5, 18.58, 26.5]); T.step(2); T.ev('interact'); T.step(5);
  T.walkTo([30.5, 18.15, 22.6], 0.2); fwd([30.5, 18.15, 10], 20); T.step(160);
  T.walkTo([30.5, 30.15, 21.0], 0.25); T.lookAt([30.5, 30.58, 19.5]); T.step(3); T.ev('interact'); T.step(60);
  T.lookAt([30.5, 24, 22.8]); T.step(1); T.ev('shift'); T.step(400);
  T.walkTo([18, 12.85, 26], 0.25); T.walkTo([12, 12.85, 26], 0.2);
  results['庭院之心'] = done();
  return results;
}
