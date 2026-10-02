import { createTrack } from '../src/track/index.js';
const t = createTrack('copacabana', { headless: true });
for (const [x,z] of [[700,-330],[800,-330],[820,-200],[900,-100],[950,50],[980,150],[1000,120],[640,-260],[190,-720],[190,-500],[60,-40],[-40,-115],[400,-60],[250,-108],[900,300]]) console.log(x,z,t.heightAt(x,z).toFixed(1));
