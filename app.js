'use strict';

// Each project resource remains unavailable until its own URL is configured.
const resourceConfig = window.FLASHSVG_CONFIG || {};
const asUrlSetting = value => typeof value === 'string' ? value.trim() : '';
let availableResources = 0;
for (const link of document.querySelectorAll('[data-resource]')) {
  const key = link.dataset.resource;
  const label = {code:'Code',paper:'Paper',model:'Model'}[key];
  const setting = key === 'code'
    ? asUrlSetting(resourceConfig.codeUrl) || asUrlSetting(resourceConfig.repositoryUrl)
    : asUrlSetting(resourceConfig[key + 'Url']);
  if (setting) {
    try {
      const url = new URL(setting);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Expected an HTTP(S) URL.');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.removeAttribute('aria-disabled');
      link.removeAttribute('tabindex');
      link.setAttribute('aria-label', label + ' (opens in a new tab)');
      link.querySelector('.resource-status').hidden = true;
      link.querySelector('.resource-arrow').hidden = false;
      availableResources++;
    } catch {
      console.warn('FlashSVG: invalid ' + key + ' URL; the resource remains unavailable.');
    }
  }
  link.addEventListener('click', event => {
    if (link.getAttribute('aria-disabled') === 'true') event.preventDefault();
  });
}
document.querySelector('#resource-note').textContent = availableResources === 3
  ? 'Explore the project resources.'
  : availableResources ? 'More project resources coming soon.' : 'Code, paper & model links coming soon.';

const rows = [
  {name:'GPT-6 Astra',note:'Closed API reference',className:'reference',icons:['0.970','0.972','0.021','—'],illustrations:['0.981','0.984','0.009','—']},
  {name:'vtracer',note:'Non-learned vectorizer',className:'reference',icons:['0.982','0.987','0.009','—'],illustrations:['0.978','0.987','0.009','—']},
  {name:'InternSVG-8B',icons:['0.863','0.819','0.161','81.0%'],illustrations:['0.840','0.842','0.155','59.0%']},
  {name:'CTRL-S (8B)',icons:['0.899','0.822','0.142','100%'],illustrations:['0.854','0.836','0.159','100%']},
  {name:'OmniSVG-4B',note:'Released model',icons:['0.776','0.837','0.197','63.0%'],illustrations:['0.707','0.834','0.245','40.0%']},
  {name:'FlashSVG-4B',note:'Ours · three-seed mean',className:'ours',icons:['0.935','0.928','0.064','99.7%'],illustrations:['0.904','0.918','0.083','98.2%']}
];

const textRows = [
  {name:'GPT-6 Astra',note:'Closed API reference',className:'reference',icons:['0.308','9.79'],illustrations:['0.313','9.83']},
  {name:'Claude Opus 5.5',note:'Closed API reference',className:'reference',icons:['0.304','9.71'],illustrations:['0.316','9.44']},
  {name:'Qwen3.8-27B',icons:['0.307','8.87'],illustrations:['0.306','8.77']},
  {name:'InternSVG-8B',icons:['0.282','5.67'],illustrations:['0.157','1.89']},
  {name:'CTRL-S (8B)',icons:['0.295','6.92'],illustrations:['0.276','5.89']},
  {name:'OmniSVG-4B',note:'Released model',icons:['0.271','4.46'],illustrations:['0.215','1.35']},
  {name:'FlashSVG-4B',note:'Ours · three-seed mean',className:'ours',icons:['0.276','5.42'],illustrations:['0.223','2.54']}
];
const timings = {
  image:{icons:[3.1,1.4,0.7],illustrations:[5.2,2.0,1.1]},
  text:{icons:[2.3,1.4,1.0],illustrations:[6.0,3.4,3.3]}
};
let currentTask='image';
let currentCategory='icons';
function renderResults() {
  const isImage=currentTask==='image';
  const taskLabel=isImage?'Image-to-SVG':'Text-to-SVG';
  const selectedRows=isImage?rows:textRows;
  const headers=isImage?['Model / method','DINO ↑','SSIM ↑','LPIPS ↓','Candidate EOS ↑']:['Model / method','CLIP ↑','Judge fidelity ↑ (0–10)'];
  const headRow=document.createElement('tr');
  headers.forEach(label=>{const cell=document.createElement('th');cell.scope='col';cell.textContent=label;headRow.append(cell)});
  document.querySelector('#results-head').replaceChildren(headRow);
  const fragment=document.createDocumentFragment();
  selectedRows.forEach(row=>{
    const tr=document.createElement('tr');
    tr.className=row.className||'';
    const th=document.createElement('th');
    th.scope='row';th.textContent=row.name;
    if(row.note){const note=document.createElement('span');note.textContent=row.note;th.append(' ',note)}
    tr.append(th);
    row[currentCategory].forEach(value=>{const td=document.createElement('td');td.textContent=value;tr.append(td)});
    fragment.append(tr);
  });
  document.querySelector('#results-body').replaceChildren(fragment);
  document.querySelector('#table-caption').textContent=`${taskLabel} ${currentCategory} · selected systems from Table 1`;
  document.querySelector('#table-note').textContent=isImage
    ?'Up to eight samples per case; the first non-empty render is scored, and cases without a valid output receive zero (LPIPS: 1). API references use one sample. EOS measures candidate termination, not render validity. FlashSVG values are means of three training seeds; baselines are single evaluations.'
    :'Text-to-SVG uses CLIP ViT-B/32 similarity and GPT-6 Astra judge fidelity (0–10). Up to eight candidates; the first non-empty render is scored, and invalid cases score 0. API references use one sample. FlashSVG values are means of three training seeds; baselines are single evaluations. Text generation remains substantially weaker than image reconstruction.';
  document.querySelector('#task-description').textContent=isImage?'Reconstruct the input image as an SVG.':'Generate an SVG from a caption prompt.';
  document.querySelector('#evaluation-description').replaceChildren(document.createTextNode(`MMSVG-Bench · ${taskLabel.toLowerCase()}`),document.createElement('br'),document.createTextNode('Icons and illustrations reported separately.'));
  document.querySelectorAll('[data-task]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.task===currentTask)));
  document.querySelectorAll('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===currentCategory)));
  const values=timings[currentTask][currentCategory];
  document.querySelectorAll('.bar-row').forEach((row,index)=>{
    row.querySelector('.bar').style.setProperty('--bar-width',`${values[index]/values[0]*100}%`);
    row.querySelector('strong').textContent=values[index].toFixed(1)+' s';
  });
  const chart=document.querySelector('#latency-chart');
  chart.setAttribute('aria-label',`Rounded ${taskLabel} ${currentCategory} latency on the same fused engine: released OmniSVG-4B, ${values[0].toFixed(1)} seconds; FlashSVG autoregressive, ${values[1].toFixed(1)} seconds; FlashSVG verified, ${values[2].toFixed(1)} seconds.`);
  chart.querySelector(':scope > p').textContent=`One H20 · batch 1 · ${taskLabel.toLowerCase()} ${currentCategory} · same fused engine. First 40 cases; rounded means from Table S8. Not API timings.`;
  document.querySelector('#results-status').textContent=`Showing ${taskLabel.toLowerCase()} ${currentCategory} results and corresponding latency.`;
}
document.querySelectorAll('[data-task]').forEach(button=>button.addEventListener('click',()=>{currentTask=button.dataset.task;renderResults()}));
document.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{currentCategory=button.dataset.category;renderResults()}));
renderResults();

const dialog = document.querySelector('#figure-dialog');
const dialogImage = document.querySelector('#dialog-image');
let previousFocus;
for (const button of document.querySelectorAll('[data-zoom]')) {
  button.addEventListener('click', () => {
    previousFocus = button;
    dialogImage.src = button.dataset.zoom;
    dialogImage.alt = button.querySelector('img').alt;
    document.querySelector('#dialog-title').textContent = button.dataset.title;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    document.querySelector('#close-dialog').focus();
  });
}
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  document.body.style.overflow = '';
  previousFocus?.focus({preventScroll:true});
});
