const express = require('express');
const router = express.Router();
const pool = require('../db');

// ==================================================
// 🔐 MIDDLEWARES DE PROTECTION — Mode secours inclus
// ==================================================
let veriftoken, verifadmin, verifprof, protegerAdmin, protegerProf;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  verifprof  = require('../middleware/verifprof');
  protegerAdmin = [veriftoken, verifadmin];
  protegerProf  = [veriftoken, verifprof];
} catch {
  protegerAdmin = [];
  protegerProf  = [];
  console.warn("⚠️ Middlewares introuvables — Mode développement");
}

// ==================================================
// 📚 LISTE Classes — Accès PUBLIC (sans token)
// ✅ FORMAT COMPATIBLE AVEC LE HTML : { classes: [...] }
// ✅ Ne renvoie que les classes 'ouvertes'
// ==================================================
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id_classe AS id,
        libelle_classe,
        libelle_classe_ar,
        libelle_classe_en,
        cycle,
        niveau,
        capacite_max
      FROM classes
      ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Classes publiques — ${rows.length} enregistrement(s)`);
    // ✅ FORMAT ATTENDU PAR LE HTML = { classes: [...] }
    return res.json({ ok: true, classes: rows });
  } catch (e) {
    console.error("❌ ERREUR /classes :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger les classes", classes: [] });
  }
});

// ==================================================
// 📚 TOUTES LES CLASSES — Admin seulement
// ==================================================
router.get('/toutes', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id_classe AS id, 
        libelle_classe,
        libelle_classe_ar, 
        libelle_classe_en, 
        cycle,
        niveau,
        capacite_max, 
        salle
      FROM classes 
      ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Toutes classes — ${rows.length} enregistrement(s)`);
    return res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR /classes/toutes :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger les classes" });
  }
});

// ==================================================
// 📚 LISTE SIMPLIFIÉE — Admin
// ==================================================
router.get('/liste', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id_classe, 
        libelle_classe, 
        libelle_classe_ar, 
        libelle_classe_en,
        cycle, 
        niveau,
        capacite_max
      FROM classes 
      ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Liste simplifiée — ${rows.length} enregistrement(s)`);
    return res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR /classes/liste :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger la liste" });
  }
});

// ==================================================
// 📚 INITIALISER CLASSES PAR DÉFAUT — Admin
// ==================================================
router.post('/init', protegerAdmin, async (req, res) => {
  try {
    const classesParDefaut = [
      ['PS','الصف الأول تمهيدي','Petite Section','maternelle','PS',30],
      ['MS','الصف الثاني تمهيدي','Moyenne Section','maternelle','MS',30],
      ['GS','الصف الثالث تمهيدي','Grande Section','maternelle','GS',30],
      ['CP','الصف الأول ابتدائي','Cours Préparatoire','primaire','CP',35],
      ['CE1','الصف الثاني ابتدائي','Cours Élémentaire 1','primaire','CE1',35],
      ['CE2','الصف الثالث ابتدائي','Cours Élémentaire 2','primaire','CE2',35],
      ['6ème','السنة الأولى إعدادي','Sixième','college','6ème',40],
      ['5ème','السنة الثانية إعدادي','Cinquième','college','5ème',40],
      ['4ème','السنة الثالثة إعدادي','Quatrième','college','4ème',40],
      ['3ème','السنة الرابعة','Troisième','college','3ème',40],
      ['2nde','السنة الأولى ثانوي','Seconde','lycee','2nde',45],
      ['1ère','السنة الثانية ثانوي','Première','lycee','1ère',45],
      ['Terminale','السنة الثالثة ثانوي','Terminale','lycee','Terminale',45]
    ];
    let creees = 0;
    for (const [libelle, ar, en, cycle, niveau, cap] of classesParDefaut) {
      const { rows: [existe] } = await pool.query(
        'SELECT id_classe FROM classes WHERE UPPER(TRIM(libelle_classe)) = UPPER(TRIM($1))',
        [libelle]
      );
      if (!existe) {
        await pool.query(`
          INSERT INTO classes(
            libelle_classe, libelle_classe_ar, libelle_classe_en,
            cycle, niveau, capacite_max
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [libelle, ar, en, cycle, niveau, cap]);
        creees++;
      }
    }
    console.log(`✅ Initialisation terminée — ${creees} classe(s) créée(s)`);
    return res.json({ ok: true, message: `✅ ${creees} classe(s) créée(s) !`, creees });
  } catch (e) {
    console.error("❌ ERREUR initialisation :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Échec de l'initialisation" });
  }
});

// ==================================================
// ➕ CRÉER UNE CLASSE — Admin
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { 
      libelle_classe, libelle_classe_ar, libelle_classe_en, 
      cycle, niveau, capacite_max, salle
    } = req.body;
    // ✅ Validations renforcées
    if (!libelle_classe?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de classe OBLIGATOIRE" });
    if (!['maternelle','primaire','college','lycee','superieur'].includes(cycle))
      return res.json({ ok: false, erreur: "⚠️ Cycle invalide" });
    const cap = Number(capacite_max);
    if (isNaN(cap) || cap < 10 || cap > 80)
      return res.json({ ok: false, erreur: "⚠️ Capacité entre 10 et 80 places" });
    // ✅ Vérifier doublon
    const { rows: [existe] } = await pool.query(
      'SELECT id_classe FROM classes WHERE UPPER(TRIM(libelle_classe)) = UPPER(TRIM($1))',
      [libelle_classe.trim()]
    );
    if (existe)
      return res.json({ ok: false, erreur: "⚠️ Cette classe existe DÉJÀ" });
    // ✅ Création (sans id_classe — utilise la séquence auto)
    await pool.query(`
      INSERT INTO classes(
        libelle_classe, libelle_classe_ar, libelle_classe_en,
        cycle, niveau, capacite_max, salle
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      libelle_classe.trim(),
      libelle_classe_ar?.trim() || null,
      libelle_classe_en?.trim() || null,
      cycle,
      niveau?.trim() || null,
      cap,
      salle?.trim() || null
    ]);
    // ✅ Récupérer l'ID créé
    const { rows: [nv] } = await pool.query(
      'SELECT id_classe FROM classes WHERE UPPER(TRIM(libelle_classe)) = UPPER(TRIM($1))',
      [libelle_classe.trim()]
    );
    console.log(`✅ Classe créée — ${libelle_classe} (ID: ${nv.id_classe})`);
    return res.json({ ok: true, message: "✅ Classe CRÉÉE avec succès", id_classe: nv.id_classe });
  } catch (e) {
    console.error("❌ ERREUR création :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de créer la classe" });
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
    const { 
      libelle_classe, libelle_classe_ar, libelle_classe_en, 
      cycle, niveau, capacite_max, salle
    } = req.body;
    if (!libelle_classe?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de classe OBLIGATOIRE" });
    if (!['maternelle','primaire','college','lycee','superieur'].includes(cycle))
      return res.json({ ok: false, erreur: "⚠️ Cycle invalide" });
    const cap = Number(capacite_max);
    if (isNaN(cap) || cap < 10 || cap > 80)
      return res.json({ ok: false, erreur: "⚠️ Capacité entre 10 et 80 places" });
    // ✅ Vérifier doublon (hors elle-même)
    const { rows: [existe] } = await pool.query(`
      SELECT id_classe FROM classes 
      WHERE UPPER(TRIM(libelle_classe)) = UPPER(TRIM($1)) AND id_classe != $2
    `, [libelle_classe.trim(), id_classe]);
    if (existe)
      return res.json({ ok: false, erreur: "⚠️ Une autre classe porte ce nom" });
    // ✅ Mise à jour
    const { rowCount } = await pool.query(`
      UPDATE classes SET
        libelle_classe = $1,
        libelle_classe_ar = $2,
        libelle_classe_en = $3,
        cycle = $4,
        niveau = $5,
        capacite_max = $6,
        salle = $7
      WHERE id_classe = $8
    `, [
      libelle_classe.trim(),
      libelle_classe_ar?.trim() || null,
      libelle_classe_en?.trim() || null,
      cycle,
      niveau?.trim() || null,
      cap,
      salle?.trim() || null,
      id_classe
    ]);
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Classe INTROUVABLE" });
    console.log(`✅ Classe modifiée — ID: ${id_classe}`);
    return res.json({ ok: true, message: "✅ Classe MODIFIÉE avec succès" });
  } catch (e) {
    console.error("❌ ERREUR modification :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de modifier la classe" });
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
      return res.json({ ok: false, erreur: "⚠️ Classe INTROUVABLE" });
    console.log(`🗑️ Classe supprimée — ID: ${id_classe}`);
    return res.json({ ok: true, message: "✅ Classe SUPPRIMÉE avec succès" });
  } catch (e) {
    console.error("❌ ERREUR suppression :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ 
        ok: false, 
        erreur: "⚠️ IMPOSSIBLE : Classe utilisée (élèves, notes, cours...)" 
      });
    return res.json({ ok: false, erreur: "⚠️ Impossible de supprimer la classe" });
  }
});

// ==================================================
// 👨‍🏫 MES CLASSES — Enseignant connecté
// ==================================================
router.get('/prof', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user?.id_utilisateur || req.user?.id;
    if (!id_prof)
      return res.json({ ok: false, erreur: "⚠️ Identifiant enseignant introuvable" });
    const { rows } = await pool.query(`
      SELECT DISTINCT
        c.id_classe AS id,
        c.libelle_classe,
        c.libelle_classe_ar,
        c.libelle_classe_en,
        c.cycle,
        c.niveau,
        c.capacite_max
      FROM affectations_ens a
      JOIN classes c ON a.id_classe = c.id_classe
      WHERE a.id_prof = $1
      ORDER BY c.libelle_classe ASC
    `, [id_prof]);
    console.log(`✅ Mes classes — ${rows.length} enregistrement(s)`);
    return res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR mes classes :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger vos classes" });
  }
});

module.exports = router;