/* ===========================================================
   SpotUy — Mapa + Lista
   - Dedupe de ubicaciones (al cargar y al crear)
   - Dedupe de eventos (exactos + 1 por día/lugar)
   - Pin gris para “próximo” si no hay evento hoy/mañana
   - Lista oculta ubicaciones sin próximos
   - Validaciones al crear (no mismo evento, 1 por día/lugar)
   - Selector de día: múltiples selects sincronizados (default "hoy")
   - FIX: mover control de zoom y recalcular tamaño
   - FIX: limpiar títulos con “L:enta” (ligaduras raras)
   =========================================================== */

/* ------------------ Utils ------------------ */
function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }

let AHORA=new Date();
let HOY=startOfDay(AHORA);
let MANIANA=addDays(HOY,1);
function refreshDayRefs(){ AHORA=new Date(); HOY=startOfDay(AHORA); MANIANA=addDays(HOY,1); }

function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function fmtFechaHora(d){
  const f=d.toLocaleDateString('es-UY',{weekday:'short',day:'2-digit',month:'2-digit'});
  const h=d.toLocaleTimeString('es-UY',{hour:'2-digit',minute:'2-digit',hour12:false});
  return `${f} ${h}`;
}
function estadoEvento(d, cancelado){
  if(cancelado) return {txt:'Cancelado', clase:'badge--cancel'};
  if(sameDay(d, HOY)){
    return d<=AHORA
      ? {txt:`Inició hoy ${d.toLocaleTimeString('es-UY',{hour:'2-digit',minute:'2-digit',hour12:false})}`, clase:'badge--hoy'}
      : {txt:`Hoy ${d.toLocaleTimeString('es-UY',{hour:'2-digit',minute:'2-digit',hour12:false})}`, clase:'badge--hoy'};
  }
  if(sameDay(d, MANIANA)){
    return {txt:`Mañana ${d.toLocaleTimeString('es-UY',{hour:'2-digit',minute:'2-digit',hour12:false})}`, clase:'badge--maniana'};
  }
  return {txt: fmtFechaHora(d), clase:''};
}

/* Limpia ":" insertados entre letras (ej. "L:enta" -> "Lenta") */
function sanitizeTitle(t){
  return String(t||'')
    .replace(/([A-Za-zÁÉÍÓÚÑáéíóúñ])\s*:\s*([A-Za-zÁÉÍÓÚÑáéíóúñ])/g, '$1$2')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ------------------ Datos estáticos ------------------ */
const DEPARTAMENTOS=[
  "Artigas","Canelones","Cerro Largo","Colonia","Durazno","Flores","Florida",
  "Lavalleja","Maldonado","Montevideo","Paysandú","Río Negro","Rivera",
  "Rocha","Salto","San José","Soriano","Tacuarembó","Treinta y Tres"
];

/* ------------------ DOM ------------------ */
const selDepto      = document.getElementById('selDepto');
const txtBuscar     = document.getElementById('txtBuscar');
const btnCancelados = document.getElementById('btnCancelados');
const contLista     = document.getElementById('listaUbicaciones');
const chipsCats     = document.getElementById('chipsCats');
const btnNuevo      = document.getElementById('btnNuevo');
const pickTip       = document.getElementById('pickTip');
const mapaDiv       = document.getElementById('mapa');

/* ===== Día del mapa: múltiples selects + default “hoy” ===== */
const daySelects = Array.from(document.querySelectorAll('#selDiaMapa, [data-role="day-select"]'));
const selDiaMapa = daySelects[0] || document.createElement('select'); // compat

function setDay(val, { updateUrl=true, rerender=true } = {}){
  const safe = (val==='maniana') ? 'maniana' : 'hoy';
  daySelects.forEach(el => el.value = safe);
  if(updateUrl){
    const depto = selDepto?.value || 'todos';
    history.replaceState({}, '', `?depto=${encodeURIComponent(depto)}&dia=${encodeURIComponent(safe)}`);
  }
  if(rerender && typeof construirMapa==='function'){ construirMapa(); }
}
function getDay(){ return (selDiaMapa?.value==='maniana') ? 'maniana' : 'hoy'; }

// Valor inicial según URL (o “hoy” si no hay ?dia=)
(function ensureDefaultDay(){
  const p = new URLSearchParams(location.search);
  const initial = p.get('dia');
  if(initial==='maniana') setDay('maniana',{updateUrl:false,rerender:false});
  else setDay('hoy',{updateUrl:false,rerender:false});
})();

// Listener de cambio (sincroniza todos)
daySelects.forEach(el=>{
  el.addEventListener('change', e => setDay(e.target.value));
});

/* ------------------ Modal Crear Evento ------------------ */
const modal          = document.getElementById('modalNuevo');
const modalBackdrop  = document.getElementById('modalBackdrop');
const formNuevo      = document.getElementById('formNuevo');
const btnCancelar    = document.getElementById('btnCancelar');

const lugarNombre = document.getElementById('lugarNombre');
const lugarDepto  = document.getElementById('lugarDepto');
const lugarBarrio = document.getElementById('lugarBarrio');
const evCat       = document.getElementById('evCat');
const evSubcat    = document.getElementById('evSubcat');
const rowSubcat   = document.getElementById('rowSubcat');
const evTitulo    = document.getElementById('evTitulo');
const evFecha     = document.getElementById('evFecha');
const evHora      = document.getElementById('evHora');
const evLink      = document.getElementById('evLink');
const evDesc      = document.getElementById('evDesc');
const evDestacado = document.getElementById('evDestacado');
const evCancelado = document.getElementById('evCancelado');
const evLat       = document.getElementById('evLat');
const evLng       = document.getElementById('evLng');

/* Completar combos de departamentos (cabecera + modal) */
DEPARTAMENTOS.forEach(d=>{
  const o=document.createElement('option'); o.value=d; o.textContent=d; selDepto.appendChild(o);
  const m=document.createElement('option'); m.value=d; m.textContent=d; lugarDepto.appendChild(m);
});

/* Subcategoría visible solo para encuentros */
function toggleSubcat(){
  if(!rowSubcat) return;
  if(evCat.value==='encuentro'){ rowSubcat.style.visibility='visible'; rowSubcat.style.opacity='1'; }
  else { rowSubcat.style.visibility='hidden'; rowSubcat.style.opacity='0'; }
}
if(evCat){ evCat.addEventListener('change', toggleSubcat); toggleSubcat(); }

/* ------------------ Filtros ------------------ */
let incluirCancelados=false;
let activeCats=new Set(['encuentro','foto']);

/* ------------------ Datos base + persistencia ------------------ */
function fechaRel(dias,h,m){ const base=addDays(HOY,dias); base.setHours(h,m,0,0); return base.getTime(); }

let lugares=[
  { id:'oceanografico',  nombre:'Museo Oceanográfico',                 lat:-34.90332, lng:-56.12357, barrio:'Buceo',       dept:'Montevideo' },
  { id:'plaza-virgilio', nombre:'Plaza Virgilio (Plaza de la Armada)', lat:-34.89905, lng:-56.08128, barrio:'Punta Gorda', dept:'Montevideo' }
];

let eventos=[
  { id:'e1', placeId:'oceanografico',  cat:'encuentro', subcat:'comun',    titulo:'Encuentro JDM',     desc:'Reunión abierta. Respeto al vecino.', startMs: fechaRel(0,16,0), cancelado:false, link:'https://instagram.com/jdm', destacado:true },
  { id:'e2', placeId:'oceanografico',  cat:'encuentro', subcat:'benefico', titulo:'Clásicos & Café',   desc:'Curados por VintageClub.',            startMs: fechaRel(7,10,30), cancelado:true,  link:'https://instagram.com/vintage' },
  { id:'e3', placeId:'plaza-virgilio', cat:'foto',                        titulo:'Spot Foto Rambla',  desc:'Fotógrafo en punto fijo.',             startMs: fechaRel(0,18,0), cancelado:false, link:'https://instagram.com/foto' },
  { id:'e4', placeId:'plaza-virgilio', cat:'foto',                        titulo:'Sunset Shoot',      desc:'Golden hour asegurada.',               startMs: fechaRel(1,18,30), cancelado:false, link:'https://instagram.com/sunset' }
];

const KEY='spotuy_data';

/* Helpers de texto y distancia */
function slugify(str){ return str.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
function distMeters(a,b){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(b.lat-a.lat), dLng=toRad(b.lng-a.lng);
  const lat1=toRad(a.lat), lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

/* ---------- Dedupe de ubicaciones ---------- */
function dedupePlaces(){
  const keep=[], remap=new Map(); // oldId -> newId
  for(let i=0;i<lugares.length;i++){
    const a=lugares[i]; if(remap.has(a.id)) continue;
    let canon=a;
    for(let j=i+1;j<lugares.length;j++){
      const b=lugares[j]; if(a.dept!==b.dept) continue;
      const near=distMeters({lat:canon.lat,lng:canon.lng},{lat:b.lat,lng:b.lng});
      const sameName=slugify(canon.nombre)===slugify(b.nombre);
      if(near<=200 || (sameName && near<=500)){
        if(!canon.barrio && b.barrio) canon.barrio=b.barrio;
        remap.set(b.id, canon.id);
      }
    }
    keep.push(canon);
  }
  if(remap.size){ eventos.forEach(ev=>{ if(remap.has(ev.placeId)) ev.placeId=remap.get(ev.placeId); }); }
  const seen=new Set();
  lugares=keep.filter(l=>{ if(seen.has(l.id)) return false; seen.add(l.id); return true; });
}

/* ---------- Dedupe de eventos ---------- */
function dayKey(ts){ const d=new Date(ts); d.setHours(0,0,0,0); return d.getTime(); }
function chooseBetter(a,b){
  // prioridad: no cancelado > más temprano > destacado
  if(a.cancelado!==b.cancelado) return a.cancelado?b:a;
  if(a.startMs!==b.startMs)     return a.startMs < b.startMs ? a : b;
  if(!!a.destacado !== !!b.destacado) return a.destacado ? a : b;
  return a;
}
function dedupeEvents(){
  // 1) exactos por (placeId|titulo|startMs|cat|subcat)
  const m1=new Map();
  for(const e of eventos){
    const k=[e.placeId,(sanitizeTitle(e.titulo)||'').toLowerCase(),e.startMs,e.cat,(e.subcat||'')].join('|');
    if(!m1.has(k)) m1.set(k,e);
    else m1.set(k, chooseBetter(m1.get(k), e));
  }
  let tmp=Array.from(m1.values());

  // 2) 1 por día y lugar
  const m2=new Map();
  for(const e of tmp){
    const k2=`${e.placeId}|${dayKey(e.startMs)}`;
    if(!m2.has(k2)) m2.set(k2, e);
    else m2.set(k2, chooseBetter(m2.get(k2), e));
  }
  eventos = Array.from(m2.values());
}

/* ---------- Normalización + storage ---------- */
function normalizeData(){
  eventos=(eventos||[]).map(e=>{
    let startMs=typeof e.startMs==='number'?e.startMs:null;
    if(startMs==null && e.startISO){ const d=new Date(e.startISO); startMs=isNaN(d)?null:d.getTime(); }
    if(startMs==null && typeof e.start==='string'){ const d=new Date(e.start); startMs=isNaN(d)?null:d.getTime(); }
    let cat=e.cat||'encuentro';
    if(cat==='autos'||cat==='feria') cat='encuentro';
    if(cat!=='encuentro' && cat!=='foto') cat='encuentro';
    let subcat=e.subcat||(cat==='encuentro'?'comun':undefined);
    let cancelado=typeof e.cancelado==='string' ? (e.cancelado==='true') : !!e.cancelado;

    // 🔧 limpiar título aquí para evitar "L:enta"
    const titulo = sanitizeTitle(e.titulo);

    return {...e, titulo, startMs, cat, subcat, cancelado};
  }).filter(e=>typeof e.startMs==='number' && !Number.isNaN(e.startMs));

  lugares=(lugares||[]).map(l=>({
    id:l.id, nombre:l.nombre, lat:Number(l.lat), lng:Number(l.lng),
    barrio:l.barrio||'', dept:l.dept||'Montevideo'
  }));

  dedupePlaces();
  dedupeEvents();
}

(function loadStorage(){
  try{
    const s=JSON.parse(localStorage.getItem(KEY)||'null');
    if(s && Array.isArray(s.lugares) && Array.isArray(s.eventos)){ lugares=s.lugares; eventos=s.eventos; }
  }catch(_){}
  normalizeData();
  saveStorage();
})();
function saveStorage(){ try{ localStorage.setItem(KEY, JSON.stringify({lugares,eventos})); }catch(_){} }

/* ------------------ Mapa Leaflet ------------------ */
const map=L.map('mapa').setView([-34.905,-56.16],12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(map);
const layer=L.layerGroup().addTo(map);
const markerByPlaceId=new Map();

/* FIX: mover control de zoom y recalcular tamaño para que no tape la UI */
map.zoomControl.setPosition('bottomright');
setTimeout(() => map.invalidateSize(), 0);
window.addEventListener('resize', () => map.invalidateSize());

// recalc al cruzar el breakpoint móvil/desktop
const mq = window.matchMedia('(max-width: 767px)');
const fix = () => setTimeout(() => map.invalidateSize(), 0);
mq.addEventListener?.('change', fix);
mq.addListener?.(fix); // fallback


const PIN_GRAY = '#94a3b8';

function colorForEvent(ev){
  if(ev.__ghost) return PIN_GRAY;
  if(ev.cat==='foto') return 'var(--foto)';
  if(ev.subcat==='benefico') return 'var(--encuentro-benefico)';
  if(ev.subcat==='legal')    return 'var(--encuentro-legal)';
  return 'var(--encuentro-comun)';
}
function iconForEvent(ev){
  const color=colorForEvent(ev);
  return L.divIcon({
    className:'',
    iconSize:[16,16],
    iconAnchor:[8,8],
    html:`<span style="display:inline-block;width:16px;height:16px;border-radius:50%;
                     background:${color};border:2px solid #0b0e13;box-shadow:0 0 0 2px #ffffff22;"></span>`
  });
}

/* ---- Google Calendar helpers ---- */
function pad(n){ return n.toString().padStart(2,'0'); }
function gcalDateLocal(d){ return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'T'+pad(d.getHours())+pad(d.getMinutes())+'00'; }
function gcalUrl(ev,l){
  const start=new Date(ev.startMs), end=new Date(ev.startMs+60*60*1000);
  const text=encodeURIComponent(ev.titulo);
  const details=encodeURIComponent((ev.desc||'')+(ev.link?` — ${ev.link}`:''));
  const location=encodeURIComponent(`${l.nombre}, ${l.barrio||''}${l.barrio?', ':''}${l.dept}`);
  const dates=gcalDateLocal(start)+'/'+gcalDateLocal(end);
  return `https://calendar.google.com/calendar/r/eventedit?text=${text}&dates=${dates}&details=${details}&location=${location}`;
}

/* ------------------ Deep links ------------------ */
function getParams(){
  const p=new URLSearchParams(location.search);
  return {depto:p.get('depto')||'todos', dia:p.get('dia')||'hoy', lugar:p.get('lugar')||null};
}
function aplicarParams(){
  const {depto,dia,lugar}=getParams();
  if([...selDepto.options].some(o=>o.value===depto)) selDepto.value=depto;
  if(dia==='hoy'||dia==='maniana') setDay(dia,{updateUrl:false,rerender:false}); else setDay('hoy',{updateUrl:false,rerender:false});
  construirMapa(); construirLista();
  if(lugar){ const el=document.getElementById('lugar-'+lugar); if(el) el.scrollIntoView({behavior:'smooth'}); }
}

/* ------------------ Render MAPA ------------------ */
function sameDayTs(ts,dayRef){ return sameDay(new Date(ts), dayRef); }

function construirMapa(){
  refreshDayRefs();
  layer.clearLayers();
  markerByPlaceId.clear();
  const diaObjetivo = (getDay()==='hoy') ? HOY : MANIANA;

  lugares.forEach(l=>{
    if(selDepto.value!=='todos' && l.dept!==selDepto.value) return;

    const valid = eventos
      .filter(e=> e.placeId===l.id)
      .filter(e=> !e.cancelado)
      .filter(e=> activeCats.has(e.cat))
      .sort((a,b)=> a.startMs - b.startMs);

    const delDia = valid.find(e => sameDayTs(e.startMs, diaObjetivo));

    let proximo = null;
    if(!delDia){
      proximo = valid.find(e => startOfDay(new Date(e.startMs)) >= HOY);
      if(proximo){ proximo = {...proximo, __ghost:true}; }
    }

    const ev = delDia || proximo;
    if(!ev) return;

    const d=new Date(ev.startMs);
    const est = delDia ? estadoEvento(d,false) : {txt:`Próximo: ${fmtFechaHora(d)}`, clase:''};

    const subcatTxt = ev.cat==='encuentro'
      ? (ev.subcat==='benefico'?'Benéfico':ev.subcat==='legal'?'Legal/grande':'Común')
      : 'Foto';

    const shareUrl=`?depto=${encodeURIComponent(selDepto.value)}&dia=${encodeURIComponent(getDay())}&lugar=${l.id}`;
    const pre = ev.__ghost ? '<div class="nota" style="margin:0 0 6px 0;">No hay evento este día.</div>' : '';

    const popup = `
      <div style="font-size:14px; line-height:1.25;">
        ${pre}
        <h3 style="margin:0 0 6px 0;">${ev.titulo}</h3>
        ${!ev.__ghost && ev.destacado ? '<span class="badge badge--destacado">Destacado</span> ' : ''}
        <span class="badge ${est.clase}">${est.txt}</span>
        <p style="color:var(--muted); margin:6px 0;">
          ${l.nombre} — ${l.barrio||''}${l.barrio?', ':''}${l.dept} · ${subcatTxt}
        </p>
        <p style="margin:6px 0;">${ev.desc||''}</p>
        ${ev.link?`<p style="margin:6px 0;"><a class="link" href="${ev.link}" target="_blank" rel="noopener">Ver detalle</a></p>`:''}
        <p style="margin:6px 0;"><a class="link" href="https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}" target="_blank" rel="noopener">Cómo llegar</a></p>
        ${!ev.__ghost ? `<p style="margin:6px 0;"><a class="link" href="${gcalUrl(ev,l)}" target="_blank" rel="noopener">Agregar a Google Calendar</a></p>`:''}
        <p style="margin:6px 0;">
          <a class="link" href="${shareUrl}" title="Compartir este lugar">Compartir</a> ·
          <a class="link" href="#lugar-${l.id}">Ver próximos</a>
        </p>
      </div>
    `;

    const m=L.marker([l.lat,l.lng],{icon:iconForEvent(ev)}).addTo(layer).bindPopup(popup);
    markerByPlaceId.set(l.id,m);
  });
}

/* ------------------ Render LISTA ------------------ */
btnCancelados?.addEventListener('click', ()=>{
  incluirCancelados=!incluirCancelados;
  btnCancelados.textContent=`Lista: incluir cancelados (${incluirCancelados?'ON':'OFF'})`;
  construirLista();
});
txtBuscar?.addEventListener('input', construirLista);
chipsCats?.addEventListener('click',(e)=>{
  const btn=e.target.closest('.chip'); if(!btn) return;
  const cat=btn.dataset.cat;
  btn.classList.toggle('chip--active');
  if(activeCats.has(cat)) activeCats.delete(cat); else activeCats.add(cat);
  construirMapa(); construirLista();
});

function dotClassForEvent(e){
  if(e.cat==='foto') return 'dot--foto';
  return e.subcat==='benefico' ? 'dot--encuentro-benefico'
       : e.subcat==='legal'    ? 'dot--encuentro-legal'
       : 'dot--encuentro-comun';
}

function construirLista(){
  refreshDayRefs();
  const q=txtBuscar?.value?.trim().toLowerCase()||'';
  contLista.innerHTML='';

  lugares.forEach(l=>{
    if(selDepto.value!=='todos' && l.dept!==selDepto.value) return;

    let lista = eventos
      .filter(e=> e.placeId===l.id)
      .filter(e=> typeof e.startMs==='number')
      .filter(e=> { const d=new Date(e.startMs); return startOfDay(d)>=HOY || sameDay(d,HOY); });

    if(!incluirCancelados) lista = lista.filter(e=> !e.cancelado);
    lista = lista.filter(e=> activeCats.has(e.cat));

    const coincideTexto = (q==='') || l.nombre.toLowerCase().includes(q) || lista.some(e => e.titulo.toLowerCase().includes(q));
    if(lista.length===0 || !coincideTexto) return;

    lista.sort((a,b)=> a.startMs - b.startMs);

    const wrap=document.createElement('section'); wrap.className='ubicacion'; wrap.id=`lugar-${l.id}`;
    const head=document.createElement('div'); head.className='ubicacion__head';
    head.innerHTML=`
      <div>
        <div class="ubicacion__titulo">${l.nombre}</div>
        <div class="ubicacion__sub">${(l.barrio||'')}${l.barrio?', ':''}${l.dept}</div>
      </div>
      <a class="link" href="https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}" target="_blank" rel="noopener">Mapa</a>
    `;
    wrap.appendChild(head);

    lista.forEach(e=>{
      const d=new Date(e.startMs), est=estadoEvento(d,e.cancelado);
      const subTxt=e.cat==='encuentro' ? (e.subcat==='benefico'?'Benéfico':e.subcat==='legal'?'Legal/grande':'Común') : 'Foto';
      const item=document.createElement('div'); item.className='item';
      item.innerHTML=`
        <div class="item__main">
          <div class="item__fecha">${fmtFechaHora(d)} · ${subTxt}</div>
          <div class="item__titulo">
            <span class="dot ${dotClassForEvent(e)}"></span>
            ${e.titulo}
          </div>
        </div>
        <div class="item__acciones">
          ${e.destacado?'<span class="badge badge--destacado">Destacado</span>':''}
          <span class="badge ${est.clase}">${est.txt}</span>
          ${e.link?`<a class="link" href="${e.link}" target="_blank" rel="noopener">Ver</a>`:''}
        </div>
      `;
      wrap.appendChild(item);
    });

    contLista.appendChild(wrap);
  });
}

/* ------------------ Crear evento ------------------ */
let addMode=false, tempMarker=null;
function openAddMode(){ addMode=true; mapaDiv.classList.add('mapa--pick'); pickTip.hidden=false; }
function closeAddMode(){ addMode=false; mapaDiv.classList.remove('mapa--pick'); pickTip.hidden=true; if(tempMarker){ layer.removeLayer(tempMarker); tempMarker=null; } }
btnNuevo?.addEventListener('click', openAddMode);

map.on('click',(e)=>{
  if(!addMode) return;
  const {lat,lng}=e.latlng;
  if(tempMarker){ layer.removeLayer(tempMarker); }
  tempMarker=L.marker([lat,lng],{draggable:true}).addTo(layer);
  tempMarker.on('dragend',()=>{ const p=tempMarker.getLatLng(); evLat.value=p.lat.toFixed(6); evLng.value=p.lng.toFixed(6); });
  evLat.value=lat.toFixed(6); evLng.value=lng.toFixed(6);
  if(selDepto.value!=='todos') lugarDepto.value=selDepto.value;
  evFecha.valueAsDate=new Date();
  openModal();
});

/* Modal open/close */
function openModal(){ 
  modal.classList.add('modal--open'); 
  modal.setAttribute('aria-hidden','false'); 
  document.body.classList.add('is-modal-open'); 
  lugarNombre.focus();
  setTimeout(()=>map.invalidateSize(),0); // por si cambia layout
}
function closeModal(){ 
  modal.classList.remove('modal--open'); 
  modal.setAttribute('aria-hidden','true'); 
  document.body.classList.remove('is-modal-open'); 
  formNuevo.reset(); evLat.value=''; evLng.value=''; 
  closeAddMode(); toggleSubcat(); 
  setTimeout(()=>map.invalidateSize(),0);
}
modalBackdrop?.addEventListener('click', closeModal);
btnCancelar?.addEventListener('click', closeModal);
window.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal(); });

/* Reusar ubicación cercana/mismo nombre */
function findExistingPlaceNear(nombre, dept, lat, lng){
  const target={lat,lng}, nameSlug=slugify(nombre);
  let best=null;
  for(const l of lugares){
    if(l.dept!==dept) continue;
    const d=distMeters(target,{lat:l.lat,lng:l.lng});
    const sameName = slugify(l.nombre)===nameSlug;
    const nearEnough = d<=200 || (sameName && d<=500);
    if(!nearEnough) continue;
    if(!best || d<best.dist) best={place:l, dist:d};
  }
  return best?best.place:null;
}

/* Submit: crear lugar + evento (validaciones) */
formNuevo?.addEventListener('submit', (e)=>{
  e.preventDefault();

  if(!lugarNombre.value || !lugarDepto.value || !evCat.value || !evTitulo.value ||
     !evFecha.value || !evHora.value || !evLat.value || !evLng.value){
    alert('Completá los campos obligatorios.');
    return;
  }
  if(evCat.value==='encuentro' && !evSubcat.value){
    alert('Seleccioná la subcategoría de Encuentro.');
    return;
  }

  const [yy,mm,dd] = evFecha.value.split('-').map(Number);
  const [hh,min]   = evHora.value.split(':').map(Number);
  const when = new Date(yy, mm-1, dd, hh, min, 0, 0);
  const ts   = when.getTime();

  const latNum=Number(evLat.value), lngNum=Number(evLng.value);
  const existing=findExistingPlaceNear(lugarNombre.value, lugarDepto.value, latNum, lngNum);
  let placeId, lugarRef;
  if(existing){
    placeId=existing.id; lugarRef=existing;
    if(!existing.barrio && lugarBarrio.value.trim()){ existing.barrio=lugarBarrio.value.trim(); }
  }else{
    placeId='p-'+slugify(lugarNombre.value)+'-'+Date.now().toString(36).slice(-5);
    lugarRef={ id:placeId, nombre:lugarNombre.value.trim(), lat:latNum, lng:lngNum, barrio:(lugarBarrio.value||'').trim(), dept:lugarDepto.value };
    lugares.push(lugarRef);
  }

  // 1) mismo evento exacto
  const sameEventExists = eventos.some(e =>
    e.placeId === placeId &&
    e.startMs === ts &&
    (e.titulo||'').trim().toLowerCase() === evTitulo.value.trim().toLowerCase() &&
    e.cat === evCat.value &&
    (e.subcat || '') === (evCat.value==='encuentro' ? evSubcat.value : '')
  );
  if (sameEventExists){
    alert('Ese evento ya existe en esa ubicación con el mismo horario.');
    return;
  }

  // 2) cualquier evento el MISMO DÍA en el MISMO LUGAR
  const dayCollision = eventos.some(e => e.placeId === placeId && sameDay(new Date(e.startMs), when));
  if (dayCollision){
    alert('En esa ubicación ya hay un evento para ese día. Solo se permite 1 evento por ubicación y día.');
    return;
  }

  const nuevoEvento = {
    id: 'e-' + Date.now().toString(36),
    placeId,
    cat: evCat.value,
    subcat: evCat.value==='encuentro' ? evSubcat.value : undefined,
    titulo: sanitizeTitle(evTitulo.value.trim()),
    desc: (evDesc.value||'').trim(),
    startMs: ts,
    cancelado: !!evCancelado.checked,
    link: (evLink.value||'').trim(),
    destacado: !!evDestacado.checked
  };
  eventos.push(nuevoEvento);

  refreshDayRefs();
  if (sameDay(when, HOY)) setDay('hoy');
  else if (sameDay(when, MANIANA)) setDay('maniana');
  else alert('El mapa muestra solo HOY o MAÑANA. Este evento es para: ' + when.toLocaleDateString('es-UY'));

  saveStorage();
  closeModal();
  selDepto.value = lugarRef.dept;

  construirMapa();
  construirLista();
  map.setView([lugarRef.lat, lugarRef.lng], 14);
  requestAnimationFrame(()=>{ const mk=markerByPlaceId.get(lugarRef.id); if(mk) mk.openPopup(); });
  setTimeout(()=>{ location.hash='lugar-'+lugarRef.id; }, 0);
});

/* ------------------ Listeners generales ------------------ */
selDepto.addEventListener('change', ()=>{
  construirMapa(); construirLista();
  history.replaceState({},'',`?depto=${encodeURIComponent(selDepto.value)}&dia=${encodeURIComponent(getDay())}`);
});

/* ------------------ Init ------------------ */
aplicarParams();

/* Dev helper: limpiar storage */
window.resetSpotUyData=()=>{ localStorage.removeItem(KEY); alert('Storage de SpotUy borrado. Recargá la página.'); };
/* ============================================================
   PATCH: Dashboard sin scroll global + mapa siempre ajustado
   Pegar al FINAL de js/app.js
   ============================================================ */
(function spotUyNoScrollPatch(){
  /* Lee alturas reales de topbar/toolbar y las pasa a CSS */
  function setChromeHeights(){
    const topbar  = document.querySelector('.topbar');
    const toolbar = document.querySelector('.toolbar');
    const th = topbar  ? topbar.offsetHeight  : 0;
    const bh = toolbar ? toolbar.offsetHeight : 0;
    document.documentElement.style.setProperty('--topbar-h',  th + 'px');
    document.documentElement.style.setProperty('--toolbar-h', bh + 'px');
  }

  /* Recalcula alturas y avisa a Leaflet para que redibuje */
  function refreshMapSize(){
    setChromeHeights();

    // Intenta encontrar el mapa (sea global o variable local)
    let _map = null;
    try { if (typeof map !== 'undefined' && map) _map = map; } catch(e){}
    if (!_map && window.map) _map = window.map;

    if (_map && _map.invalidateSize){
      // Mueve el control de zoom (si no estaba ya) y recalcula tamaño
      try { _map.zoomControl && _map.zoomControl.setPosition('bottomright'); } catch(e){}
      setTimeout(() => _map.invalidateSize(), 0);
    }
  }

  // Si el mapa está en variable local, exponelo globalmente (opcional)
  try { if (typeof map !== 'undefined' && map && !window.map) window.map = map; } catch(e){}

  // Recalcular en eventos clave
  const mq = window.matchMedia('(max-width: 767px)');
  window.addEventListener('load',              refreshMapSize);
  window.addEventListener('resize',            refreshMapSize);
  window.addEventListener('orientationchange', refreshMapSize);
  mq.addEventListener?.('change',              refreshMapSize);
  mq.addListener?.(refreshMapSize); // fallback navegadores viejos

  // Por si este archivo se inyecta después del load
  refreshMapSize();
})();
