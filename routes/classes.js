const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');

// ✅ Protections groupées uniformes
const protegerAdmin = [veriftoken, verifadmin];
const protegerProf = [veriftoken, verifprof];

// ==================================================
// 📚 LISTE Classes — Accès PUBLIC (sans token)
// → Correspondance EXACTE colonnes table + format attendu front ✅
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
        capacite_max,
        CASE 
          WHEN capacite_max IS NOT NULL AND capacite_max > 0 
          THEN capacite_max - COALESCE(places_occupees, 0) 
          ELSE NULL 
        END::INTEGER AS places_restantes,
        statut
      FROM classes
      ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Classes publiques chargées — ${rows.length} classe(s)`);
    res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR /classes :", e.code, e.message);
    res.status(500).json({ ok: false, erreur: "⚠️ Impossible de charger les classes" });
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
        COALESCE(places_occupees, 0) AS places_occupees,
        CASE 
          WHEN capacite_max IS NOT NULL AND capacite_max > 0 
          THEN capacite_max - COALESCE(places_occupees, 0) 
          ELSE NULL 
        END::INTEGER AS places_restantes,
        salle, 
        statut
      FROM classes 
      ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Toutes classes chargées — ${rows.length}`);
    res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR /classes/toutes :", e.code, e.message);
    res.status(500).json({ ok: false, erreur: e.message });
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
        capacite_max, 
        statut
      FROM classes 
      ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Liste classes simplifiée chargée — ${rows.length}`);
    res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR /classes/liste :", e.code, e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📚 INITIALISER CLASSES PAR DÉFAUT — Admin
// ==================================================
router.post('/init', protegerAdmin, async (req, res) => {
  try {
    const classes = [
      ['PS','الصف الأول تمهيدي','Petite Section','maternelle','PS',30],
      ['MS','الصف الثاني تمهيدي','Moyenne Section','maternelle','MS',30],
      ['GS','الصف الثالث تمهيدي','Grande Section','maternelle','GS',30],
      ['CP','الصف الأول ابتدائي','Cours Préparatoire','primaire','CP',35],
      ['CE1','الصف الثاني ابتدائي','Cours Élémentaire 1','primaire','CE1',35],
      ['CE2','الصف الثالث ابتدائي','Cours Élémentaire 2','primaire','CE2',35],
      ['6ème','السنة الأولى إعدادي','Sixième','college','6ème',40],
      ['5ème','السنة الثانية إعدادي','Cinquième','college','5ème',40],
      ['4ème','السنة الثالثة إعدادي','Quatrième','college','4ème',40],
      ['3ème','السنة الرابعة إعدادي','Troisième','college','3ème',40],
      ['2nde','السنة الأولى ثانوي','Seconde','lycee','2nde',45],
      ['1ère','السنة الثانية ثانوي','Première','lycee','1ère',45],
      ['Terminale','السنة الثالثة ثانوي','Terminale','lycee','Terminale',45]
    ];

    let inseres = 0;
    for (const [libelle, ar, en, cycle, niveau, cap] of classes) {
      const { rows: [existe] } = await pool.query(
        'SELECT id_classe FROM classes WHERE libelle_classe = $1', [libelle]
      );
      if (!existe) {
        await pool.query(`
          INSERT INTO classes(
            libelle_classe, libelle_classe_ar, libelle_classe_en,
            cycle, niveau, capacite_max, places_occupees, statut
          )
          VALUES ($1, $2, $3, $4, $5, $6, 0, 'ouverte')
        `, [libelle, ar, en, cycle, niveau, cap]);
        inseres++;
      }
    }

    console.log(`✅ ${inseres} classe(s) créée(s) par initialisation`);
    res.json({ ok: true, message: `✅ ${inseres} classes créées !`, creees: inseres });
  } catch (e) {
    console.error("❌ ERREUR initialisation classes :", e.code, e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📚 CRÉER UNE CLASSE — Admin
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { 
      libelle_classe, libelle_classe_ar, libelle_classe_en, 
      cycle, niveau, capacite_max, salle, statut 
    } = req.body;

    // ✅ Validations renforcées
    if (!libelle_classe?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de classe obligatoire" });
    if (!['maternelle','primaire','college','lycee','superieur'].includes(cycle))
      return res.json({ ok: false, erreur: "⚠️ Cycle invalide" });
    if (!['ouverte','complete','fermee'].includes(statut))
      return res.json({ ok: false, erreur: "⚠️ Statut invalide" });

    const cap = Number(capacite_max);
    if (isNaN(cap) || cap < 10 || cap > 80)
      return res.json({ ok: false, erreur: "⚠️ Capacité entre 10 et 80" });

    // ✅ Vérifier doublon avant création
    const { rows: [existe] } = await pool.query(
      'SELECT id_classe FROM classes WHERE UPPER(TRIM(libelle_classe)) = UPPER(TRIM($1))', 
      [libelle_classe.trim()]
    );
    if (existe)
      return res.json({ ok: false, erreur: "⚠️ Cette classe existe déjà" });

    // ✅ Récupérer prochain ID
    const { rows: [{ prochain }] } = await pool.query(
      'SELECT COALESCE(MAX(id_classe), 0) + 1 AS prochain FROM classes'
    );

    await pool.query(`
      INSERT INTO classes(
        id_classe, libelle_classe, libelle_classe_ar, libelle_classe_en,
        cycle, niveau, capacite_max, places_occupees, salle, statut
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9)
    `, [
      prochain, 
      libelle_classe.trim(), 
      libelle_classe_ar || null, 
      libelle_classe_en || null, 
      cycle, 
      niveau || null,
      cap, 
      salle || null, 
      statut
    ]);

    console.log(`✅ Classe créée — ${libelle_classe} (ID: ${prochain})`);
    res.json({ ok: true, message: "✅ Classe créée", id_classe: prochain });
  } catch (e) {
    console.error("❌ ERREUR création classe :", e.code, e.message);
    res.status(500).json({ ok: false, erreur: e.message });
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
      cycle, niveau, capacite_max, salle, statut 
    } = req.body;

    if (!libelle_classe?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de classe obligatoire" });
    if (!['maternelle','primaire','college','lycee','superieur'].includes(cycle))
      return res.json({ ok: false, erreur: "⚠️ Cycle invalide" });
    if (!['ouverte','complete','fermee'].includes(statut))
      return res.json({ ok: false, erreur: "⚠️ Statut invalide" });

    const cap = Number(capacite_max);
    if (isNaN(cap) || cap < 10 || cap > 80)
      return res.json({ ok: false, erreur: "⚠️ Capacité entre 10 et 80" });

    // ✅ Vérifier doublon libellé (hors lui-même) — insensible à la casse
    const { rows: [existe] } = await pool.query(
      `SELECT id_classe FROM classes 
       WHERE UPPER(TRIM(libelle_classe)) = UPPER(TRIM($1)) AND id_classe != $2`, 
      [libelle_classe.trim(), id_classe]
    );
    if (existe)
      return res.json({ ok: false, erreur: "⚠️ Une autre classe porte déjà ce nom" });

    const { rowCount } = await pool.query(`
      UPDATE classes
      SET libelle_classe = $1, 
          libelle_classe_ar = $2, 
          libelle_classe_en = $3,
          cycle = $4, 
          niveau = $5,
          capacite_max = $6, 
          salle = $7, 
          statut = $8
      WHERE id_classe = $9
    `, [
      libelle_classe.trim(), 
      libelle_classe_ar || null, 
      libelle_classe_en || null, 
      cycle, 
      niveau || null,
      cap, 
      salle || null, 
      statut,
      id_classe
    ]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Classe introuvable" });

    console.log(`✅ Classe mise à jour — ID: ${id_classe}`);
    res.json({ ok: true, message: "✅ Classe mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR modification classe :", e.code, e.message);
    res.status(500).json({ ok: false, erreur: e.message });
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
      return res.json({ 
        ok: false, 
        erreur: "⚠️ Impossible : utilisée dans des affectations, notes ou inscriptions" 
      });
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 👨‍🏫 MES CLASSES — Prof connecté
// ==================================================
router.get('/prof', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    if (!id_prof) 
      return res.json({ ok: false, erreur: "⚠️ Identifiant enseignant introuvable dans le jeton" });

    const { rows } = await pool.query(`
      SELECT DISTINCT 
        c.id_classe AS id, 
        c.libelle_classe,
        c.libelle_classe_ar, 
        c.libelle_classe_en, 
        c.cycle,
        c.niveau,
        c.capacite_max, 
        CASE 
          WHEN c.capacite_max IS NOT NULL AND c.capacite_max > 0 
          THEN c.capacite_max - COALESCE(c.places_occupees, 0) 
          ELSE NULL 
        END::INTEGER AS places_restantes
      FROM affectations_ens a
      JOIN classes c ON a.id_classe = c.id_classe
      WHERE a.id_prof = $1 
      ORDER BY c.libelle_classe ASC
    `, [id_prof]);

    console.log(`✅ Mes classes chargées — ${rows.length}`);
    res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR mes classes :", e.code, e.message);
    res.status(500).json({ ok: false, erreur: e.message });
  }
});

module.exports = router;