// Prepara los modelos CC0 de Quaternius para la web: texturas a 1024 en WebP,
// sólo las animaciones que usamos, todo en .glb.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, prune, dedup, resample, weld, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const OUT = 'public/models/';
const tex = (size) => textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 });

async function character(src, out) {
  const d = await io.read('raw/' + src);
  await d.transform(dedup(), prune(), tex(1024));
  await io.write(OUT + out, d);
}
async function hair(src, out) {
  const d = await io.read('raw/' + src);
  await d.transform(dedup(), prune(), tex(512));
  await io.write(OUT + out, d);
}
async function anims() {
  const keep = new Set(['Idle_Loop','Walk_Loop','Sitting_Enter','Sitting_Idle_Loop','Sitting_Talking_Loop','Sitting_Exit',
    'Idle_Talking_Loop','Celebration','Dance_Loop','Idle_LookAround_Loop','Interact']);
  const d = await io.read('raw/UAL1.glb');
  const r = d.getRoot();
  r.listAnimations().forEach(a => { if (!keep.has(a.getName())) { a.listSamplers().forEach(sm => sm.dispose()); a.listChannels().forEach(c => c.dispose()); a.dispose(); } });
  // quitar el maniquí: sólo quedan los huesos con sus animaciones
  r.listNodes().forEach(n => { if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); } });
  r.listMaterials().forEach(m => m.dispose()); r.listTextures().forEach(t => t.dispose());
  await d.transform(resample(), prune({ keepLeaves: true, keepAttributes: false }));
  console.log('anims:', r.listAnimations().map(a => a.getName()).join(', '));
  await io.write(OUT + 'anims.glb', d);
}
fs.mkdirSync(OUT, { recursive: true });
await character('Superhero_Male_FullBody.gltf', 'male.glb');
await character('Superhero_Female_FullBody.gltf', 'female.glb');
for (const h of ['Hair_Long','Hair_Buns','Hair_SimpleParted','Hair_Buzzed','Hair_BuzzedFemale','Hair_Beard','Eyebrows_Female','Eyebrows_Regular'])
  await hair(h + '.gltf', h.toLowerCase() + '.glb');
await anims();
for (const [s, o] of [['T_Superhero_Male_Ligh.png','skin_male_light.webp'],['T_Superhero_Male_Dark.png','skin_male_dark.webp'],
                      ['T_Superhero_Female_Light_BaseColor.png','skin_female_light.webp'],['T_Superhero_Female_Dark_BaseColor.png','skin_female_dark.webp']])
  await sharp('raw/' + s).resize(1024, 1024).webp({ quality: 82 }).toFile(OUT + o);
fs.copyFileSync('raw/LICENSE-characters.txt', OUT + 'LICENSE-Quaternius-CC0.txt');
