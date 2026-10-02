// QA: Marco's driver face (photo) on the character preview, all expressions/poses the factory offers, front-on.
import { launch, waitScreen } from './qa_lib.mjs';
const g = await launch({ query: 'quality=low', w: 960, h: 540 });
const { page, shot, wait, ev } = g;
await waitScreen(page, 'title'); await page.keyboard.press('Space'); await waitScreen(page, 'menu'); await wait(700);
await page.click('section[data-screen=menu] button[data-id=single]'); await waitScreen(page, 'char'); await wait(1500);
for (const [name, expr, pose] of [['neutral', 'neutral', 'drive'], ['happy', 'happy', 'celebrate'], ['sad', 'sad', 'defeat'], ['hit', 'hit', 'spin'], ['boost', 'boost', 'drive']]) {
  await ev(([expr, pose]) => { const t = window.__mk.game.ui.turntable; t.stop(); t.yaw = 0.3; t.pop = 1; const d = t.current.dk.driver; d.userData.setExpression(expr); d.userData.setPose(pose); t.pivot.rotation.y = t.yaw; t.pivot.scale.setScalar(1); t.pivot.updateMatrixWorld(true); const hp = d.userData.head.getWorldPosition(new t.camera.position.constructor()); t.camera.fov = 14; t.camera.updateProjectionMatrix(); const dir = new t.camera.position.constructor(Math.sin(0.3 + 0.0), 0.1, Math.cos(0.3)).multiplyScalar(6); t.camera.position.copy(hp).add(dir); t.camera.lookAt(hp); t.renderer.render(t.scene, t.camera); }, [expr, pose]);
  await wait(400); await (await page.$('.tt-canvas')).screenshot({ path: `shots/qa/face_${name}.png` });
}
console.log('problems:', g.problems.join('\n') || 'none');
await g.close();
