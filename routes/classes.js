const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');

// ✅ Protections
const protegerAdmin = [veriftoken, verifadmin];
const protegerProf = [veriftoken, verifprof];


// ==================================================
// 📚 LISTE PUBLIQUE — Classes ouvertes (Préinscription)
// ==================================================
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id_classe AS id,
        libelle_classe AS nom,
        libelle_classe_ar,
        libelle_classe_en,
        cycle,
        capacite_max,
        places_occupees,
        (capacite_max - places_occupees) AS places_restantes,
        statut
      FROM classes
      WHERE statut = 'ouverte'
      ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Classes ouvertes chargées — ${rows.length} classe(s)`);
    res.json({ ok: true, classes: rows });
  } catch (e) {
    console.error("❌ ERREUR /classes :", e.code, e.message);
    res.json({ ok: false, erreur: "⚠️ Impossible de charger les classes" });
  }
});


// ==================================================
// 📚 TOUTES LES CLASSES — Admin
// ==================================================
router.get('/toutes', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_classe AS id, libelle_classe AS nom,
             libelle_classe_ar, libelle_classe_en, cycle,
             capacite_max, places_occupees,
             (capacite_max - places_occupees) AS places_restantes,
             salle, statut
      FROM classes ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Toutes classes chargées — ${rows.length}`);
    res.json({ ok: true, classes: rows });
  } catch (e) {
    console.error("❌ ERREUR /classes/toutes :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📚 LISTE SIMPLIFIÉE — Admin
// ==================================================
router.get('/liste', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_classe, libelle_classe, libelle_classe_ar, libelle_classe_en,
             cycle, capacite_max, statut
      FROM classes ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Liste classes chargée — ${rows.length}`);
    res.json({ ok: true, liste: rows });
  } catch (e) {
    console.error("❌ ERREUR /classes/liste :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📚 INITIALISER CLASSES PAR DÉFAUT — Admin
// ==================================================
router.post('/init', protegerAdmin, async (req, res) => {
  try {
    const classes = [
      ['CP1','الصف الأول ابتدائي','First Year Primary','primaire',35],
      ['CP2','الصف الثاني ابتدائي','Second Year Primary','primaire',35],
      ['CE1','الصف الثالث ابتدائي','Third Year Primary','primaire',35],
      ['CE2','الصف الرابع ابتدائي','Fourth Year Primary','primaire',35],
      ['CM1','الصف الخامس ابتدائي','Fifth Year Primary','primaire',35],
      ['CM2','الصف السادس ابتدائي','Sixth Year Primary','primaire',35],
      ['6ème','السنة الأولى إعدادي','First Year Middle School','college',40],
      ['5ème','السنة الثانية إعدادي','Second Year Middle School','college',40],
      ['4ème','السنة الثالثة إعدادي','Third Year Middle School','college',40],
      ['3ème','السنة الرابعة إعدادي','Fourth Year Middle School','college',40],
      ['2nde','السنة الأولى ثانوي','First Year High School','lycee',45],
      ['1ère','السنة الثانية ثانوي','Second Year High School','lycee',45],
      ['Terminale','السنة الثالثة ثانوي','Final Year High School','lycee',45],
      ['Maternelle','التمهيدي','Kindergarten','maternelle',30]
    ];

    let inseres = 0;
    for (const [libelle, ar, en, cycle, cap] of classes) {
      const { rows: [existe] } = await pool.query(
        'SELECT id_classe FROM classes WHERE libelle_classe = $1', [libelle]
      );
      if (!existe) {
        await pool.query(`
          INSERT INTO classes(libelle_classe, libelle_classe_ar, libelle_classe_en,
            cycle, capacite_max, places_occupees, statut)
          VALUES ($1, $2, $3, $4, $5, 0, 'ouverte')
        `, [libelle, ar, en, cycle, cap]);
        inseres++;
      }
    }

    console.log(`✅ ${inseres} classe(s) créée(s)`);
    res.json({ ok: true, message: `✅ ${inseres} classes créées !`, creees: inseres });
  } catch (e) {
    console.error("❌ ERREUR init classes :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📚 CRÉER UNE CLASSE — Admin
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { libelle_classe, libelle_classe_ar, libelle_classe_en, cycle, capacite_max, salle, statut } = req.body;

    if (!libelle_classe?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de classe obligatoire" });
    if (!['maternelle','primaire','college','lycee','superieur'].includes(cycle))
      return res.json({ ok: false, erreur: "⚠️ Cycle invalide" });
    if (!['ouverte','complete','fermee'].includes(statut))
      return res.json({ ok: false, erreur: "⚠️ Statut invalide" });

    const cap = Number(capacite_max);
    if (isNaN(cap) || cap < 10 || cap > 80)
      return res.json({ ok: false, erreur: "⚠️ Capacité entre 10 et 80" });

    const { rows: [{ prochain }] } = await pool.query(
      'SELECT COALESCE(MAX(id_classe),0)+1 AS prochain FROM classes'
    );

    await pool.query(`
      INSERT INTO classes(id_classe, libelle_classe, libelle_classe_ar, libelle_classe_en,
        cycle, capacite_max, places_occupees, salle, statut)
      VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
    `, [prochain, libelle_classe.trim(), libelle_classe_ar || null, libelle_classe_en || null, cycle, cap, salle || null, statut]);

    console.log(`✅ Classe créée — ${libelle_classe} (ID: ${prochain})`);
    res.json({ ok: true, message: "✅ Classe créée", id_classe: prochain });
  } catch (e) {
    console.error("❌ ERREUR création classe :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// ✏️ MODIFIER UNE CLASSE — Admin
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id);
    if (isNaN(id_classe))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { libelle_classe, libelle_classe_ar, libelle_classe_en, cycle, capacite_max, salle, statut } = req.body;

    if (!libelle_classe?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de classe obligatoire" });
    if (!['maternelle','primaire','college','lycee','superieur'].includes(cycle))
      return res.json({ ok: false, erreur: "⚠️ Cycle invalide" });
    if (!['ouverte','complete','fermee'].includes(statut))
      return res.json({ ok: false, erreur: "⚠️ Statut invalide" });

    const cap = Number(capacite_max);
    if (isNaN(cap) || cap < 10 || cap > 80)
      return res.json({ ok: false, erreur: "⚠️ Capacité entre 10 et 80" });

    const { rowCount } = await pool.query(`
      UPDATE classes
      SET libelle_classe = $1, libelle_classe_ar = $2, libelle_classe_en = $3,
          cycle = $4, capacite_max = $5, salle = $6, statut = $7
      WHERE id_classe = $8
    `, [libelle_classe.trim(), libelle_classe_ar || null, libelle_classe_en || null, cycle, cap, salle || null, statut, id_classe]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Classe introuvable" });

    console.log(`✅ Classe mise à jour — ID: ${id_classe}`);
    res.json({ ok: true, message: "✅ Classe mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR modification classe :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🗑️ SUPPRIMER UNE CLASSE — Admin
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id);
    if (isNaN(id_classe))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rowCount } = await pool.query(
      'DELETE FROM classes WHERE id_classe = $1', [id_classe]
    );
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Classe introuvable" });

    console.log(`🗑️ Classe supprimée — ID: ${id_classe}`);
    res.json({ ok: true, message: "✅ Classe supprimée" });
  } catch (e) {
    console.error("❌ ERREUR suppression classe :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Impossible : utilisée dans des affectations ou notes" });
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 👨‍🏫 MES CLASSES — Prof connecté
// ==================================================
router.get('/prof', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    const { rows } = await pool.query(`
      SELECT DISTINCT c.id_classe AS id, c.libelle_classe AS nom,
             c.libelle_classe_ar, c.libelle_classe_en, c.cycle,
             c.capacite_max, (c.capacite_max - c.places_occupees) AS places_restantes
      FROM affectations_ens a
      JOIN classes c ON a.id_classe = c.id_classe
      WHERE a.id_prof = $1 ORDER BY c.libelle_classe ASC
    `, [id_prof]);
    console.log(`✅ Mes classes chargées — ${rows.length}`);
    res.json({ ok: true, classes: rows });
  } catch (e) {
    console.error("❌ ERREUR mes classes :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;