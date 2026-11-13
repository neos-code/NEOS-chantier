/* ═══════════════════════════════════════════════════════════════════
   NEOS Chantier — Actions partagées d'un projet
   ───────────────────────────────────────────────────────────────────
   Chaque action garde l'historique de ses modifications (création,
   édition, suppression), chacune signée par le document qui l'a faite.

   Règle de propagation : une modification n'est visible que dans le
   document qui l'a faite et dans ceux qui viennent APRÈS lui dans le
   déroulement du chantier :
       VT  →  Ouverture  →  Suivi  →  Fermeture
   Entre deux documents du même type, l'ordre est celui de leur date
   de création. Une modification ne « remonte » donc jamais.

     - Modifiée dans un Suivi      → visible dans les Suivis suivants et
                                      la Fermeture, pas dans l'Ouverture.
     - Modifiée dans la Fermeture  → visible uniquement dans cette
                                      Fermeture (et les suivantes).
     - Tableau « Suivi des actions » du projet → voit TOUTES les
       modifications (dernière modification gagnante).
     - Modification faite depuis ce tableau → visible dans le tableau et
       dans les documents créés après elle (les documents existants ne
       bougent pas).

   Stockage : localStorage['neos_project_actions'] (même clé qu'avant ;
   les anciennes actions sont reprises telles quelles comme état de
   départ, visible partout).
═══════════════════════════════════════════════════════════════════ */
(function(global){
  const KEY = 'neos_project_actions';
  const RANK = { vt:0, ouverture:1, suivi:2, fermeture:3 };
  const DEFAULTS = { qui:'', date:'', action:'', statut:'À faire' };
  const FIELDS = Object.keys(DEFAULTS);
  const DASHBOARD = Object.freeze({ dashboard:true });

  function norm(k, v){ return (v===undefined || v===null || v==='') ? DEFAULTS[k] : String(v); }

  /* Anciennes actions (sans historique) → leur état actuel devient l'état
     de base, visible par tous les documents. */
  function normalize(a){
    if(!Array.isArray(a.edits)){
      a.base = {};
      FIELDS.forEach(k=>a.base[k]=norm(k, a[k]));
      a.edits = [];
    }
    return a;
  }

  function readAll(){
    try{ return JSON.parse(localStorage.getItem(KEY)||'[]').map(normalize); }
    catch(e){ return []; }
  }

  function writeAll(all){
    // Les champs « à plat » reflètent la vue globale (tableau du projet).
    all.forEach(a=>{
      const r = resolve(a, DASHBOARD);
      FIELDS.forEach(k=>a[k]=norm(k, r.st[k]));
      a.deleted = !r.exists;
    });
    try{ localStorage.setItem(KEY, JSON.stringify(all)); return true; }
    catch(e){ console.warn('NeosActions: écriture impossible', e); return false; }
  }

  /* Contexte d'un document : son type (rang) et sa date de création. */
  function docContext(docId, fallbackType){
    let docs = [];
    try{ docs = JSON.parse(localStorage.getItem('neos_documents')||'[]'); }catch(e){}
    const d = docs.find(x=>x.id===docId);
    const type = (d && d.type) || fallbackType;
    return {
      docId,
      type,
      rank: (type in RANK) ? RANK[type] : 99,
      docCreatedAt: (d && d.createdAt) || Date.now()
    };
  }

  function visible(e, ctx){
    if(!ctx || ctx.dashboard) return true;
    if(e.dashboard) return e.at <= ctx.docCreatedAt;
    if(e.rank !== ctx.rank) return e.rank < ctx.rank;
    return e.docId === ctx.docId || e.docCreatedAt <= ctx.docCreatedAt;
  }

  function resolve(a, ctx){
    let exists = !!a.base;
    const st = { ...DEFAULTS, ...(a.base||{}) };
    a.edits
      .filter(e=>visible(e, ctx))
      .sort((x,y)=>x.at-y.at)
      .forEach(e=>{
        if(e.deleted){ exists = false; return; }
        if(e.created) exists = true;
        else if(!exists) return;
        Object.assign(st, e.patch||{});
      });
    return { exists, st };
  }

  function sameAuthor(e, ctx){
    if(ctx.dashboard) return !!e.dashboard;
    return !e.dashboard && e.docId === ctx.docId;
  }

  function mkEdit(ctx, extra){
    const base = ctx.dashboard
      ? { at:Date.now(), dashboard:true }
      : { at:Date.now(), docId:ctx.docId, rank:ctx.rank, docCreatedAt:ctx.docCreatedAt };
    return { ...base, ...extra };
  }

  function view(a, r){
    return {
      id:a.id, projectId:a.projectId, createdAt:a.createdAt||0,
      sourceDocId:a.sourceDocId||'', sourceLabel:a.sourceLabel||'',
      linkedKey:a.linkedKey||'', linkedLabel:a.linkedLabel||'',
      qui:norm('qui',r.st.qui), date:norm('date',r.st.date),
      action:norm('action',r.st.action), statut:norm('statut',r.st.statut)
    };
  }

  /* Liste des actions d'un projet telles que les voit le contexte donné. */
  function list(projectId, ctx){
    if(!projectId) return [];
    return readAll()
      .filter(a=>a.projectId===projectId)
      .map(a=>{ const r=resolve(a, ctx); return r.exists ? view(a, r) : null; })
      .filter(Boolean)
      .sort((x,y)=>x.createdAt-y.createdAt);
  }

  function newId(){ return 'act_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

  /* Crée (ou fait réapparaître) une action dans le contexte donné. */
  function create(projectId, ctx, fields, meta, id){
    if(!projectId) return null;
    const all = readAll();
    id = id || newId();
    let a = all.find(x=>x.id===id);
    if(!a){
      a = { id, projectId, createdAt:Date.now(), sourceDocId:ctx.docId||'', edits:[] };
      all.push(a);
    }
    Object.assign(a, meta||{});
    const patch = {};
    FIELDS.forEach(k=>patch[k]=norm(k, (fields||{})[k]));
    a.edits.push(mkEdit(ctx, { created:true, patch }));
    writeAll(all);
    return id;
  }

  /* Modifie une action. Seuls les champs réellement différents de ce que
     voit le document sont enregistrés. Les frappes successives d'un même
     document sont regroupées en une seule modification. */
  function update(projectId, ctx, id, patch, meta){
    const all = readAll();
    const a = all.find(x=>x.id===id && x.projectId===projectId);
    if(!a) return false;
    const r = resolve(a, ctx);
    if(!r.exists) return false;
    const diff = {};
    Object.keys(patch||{}).forEach(k=>{
      if(FIELDS.includes(k) && norm(k, r.st[k]) !== norm(k, patch[k])) diff[k] = norm(k, patch[k]);
    });
    let metaChanged = false;
    Object.entries(meta||{}).forEach(([k,v])=>{ if(a[k]!==v){ a[k]=v; metaChanged=true; } });
    if(!Object.keys(diff).length){ if(metaChanged) writeAll(all); return true; }
    const last = a.edits[a.edits.length-1];
    if(last && !last.deleted && sameAuthor(last, ctx)){
      last.patch = { ...(last.patch||{}), ...diff };
      last.at = Date.now();
    } else {
      a.edits.push(mkEdit(ctx, { patch:diff }));
    }
    writeAll(all);
    return true;
  }

  /* Met à jour si l'action est visible, sinon la crée / la fait réapparaître. */
  function upsert(projectId, ctx, id, fields, meta){
    if(!projectId) return;
    if(!update(projectId, ctx, id, fields, meta)) create(projectId, ctx, fields, meta, id);
  }

  function remove(projectId, ctx, id){
    const all = readAll();
    const a = all.find(x=>x.id===id && x.projectId===projectId);
    if(!a || !resolve(a, ctx).exists) return;
    a.edits.push(mkEdit(ctx, { deleted:true }));
    writeAll(all);
  }

  /* Identifiant d'une action liée à une réserve : propre à chaque document
     (évite que deux rapports du même projet écrivent sur la même ligne). */
  function linkedId(docId, key){ return 'lnk_'+docId+'__'+key; }

  /* Reprise des anciennes actions liées (id = linkedKey, partagé entre
     documents) vers le nouvel identifiant propre au document. */
  function migrateLinkedIds(docId){
    const all = readAll();
    let changed = false;
    all.forEach(a=>{
      if(a.linkedKey && a.sourceDocId===docId && a.id===a.linkedKey){
        const nid = linkedId(docId, a.linkedKey);
        if(!all.some(x=>x.id===nid)){ a.id = nid; changed = true; }
      }
    });
    if(changed) writeAll(all);
  }

  function purgeProject(projectId){
    writeAll(readAll().filter(a=>a.projectId!==projectId));
  }

  global.NeosActions = {
    DASHBOARD, docContext, list, create, update, upsert, remove,
    linkedId, migrateLinkedIds, purgeProject
  };
})(window);
