const express = require('express');
const router = express.Router();
const pool = require('../db');

// ==================================================
// 🔐 MIDDLEWARES DE PROTECTION — Mode secours inclus
// ==================================================
let veriftoken, verifadmin, protegerAdmin;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  protegerAdmin = [veriftoken, verifadmin];
} catch {
  protegerAdmin = []; // Mode développement sans middleware
  console.warn("⚠️ Middlewares introuvables — Mode développement");
}

// ==================================================
// 📖 LISTE DES MATIÈRES — Accès PUBLIC
// → Format standardisé : { ok, lignes }
// ==================================================
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id_matiere,
        libelle_matiere,
        libelle_matiere_ar,
        coefficient,
        volume_horaire,
        langue_ens
      FROM matieres
      ORDER BY libelle_matiere ASC
    `);
    console.log(`✅ Matières chargées — ${rows.length} enregistrement(s)`);
    return res.json({ ok: true, lignes: rows });
  } catch (e) {
    console.error("❌ ERREUR liste matières :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger les matières" });
  }
});

// ==================================================
// 🔍 DÉTAIL D'UNE MATIÈRE — Accès PUBLIC
// ==================================================
router.get('/:id', async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rows: [matiere] } = await pool.query(`
      SELECT 
        id_matiere,
        libelle_matiere,
        libelle_matiere_ar,
        coefficient,
        volume_horaire,
        langue_ens
      FROM matieres 
      WHERE id_matiere = $1
    `, [id_matiere]);

    if (!matiere)
      return res.json({ ok: false, erreur: "⚠️ Matière INTROUVABLE" });

    console.log(`✅ Matière consultée — "${matiere.libelle_matiere}" (ID: ${id_matiere})`);
    return res.json({ ok: true, matiere });
  } catch (e) {
    console.error("❌ ERREUR détail matière :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Erreur serveur" });
  }
});

// ==================================================
// ➕ CRÉER UNE MATIÈRE — Admin seulement
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { libelle_matiere, libelle_matiere_ar, coefficient, volume_horaire, langue_ens } = req.body;

    // ✅ Champ obligatoire
    if (!libelle_matiere?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de la matière OBLIGATOIRE" });

    // ✅ Valeurs nettoyées et validées
    const libelle = libelle_matiere.trim();
    const libelle_ar = libelle_matiere_ar?.trim() || null;
    const coef = !isNaN(parseFloat(coefficient)) ? Math.max(1, parseFloat(coefficient)) : 1;
    const vol = !isNaN(parseInt(volume_horaire)) ? Math.max(1, parseInt(volume_horaire)) : 3;
    const langue = ['fr', 'ar', 'en'].includes(langue_ens?.toLowerCase()) ? langue_ens.toLowerCase() : 'fr';

    // ✅ Vérification doublon (insensible à la casse et espaces)
    const { rows: existe } = await pool.query(`
      SELECT id_matiere 
      FROM matieres 
      WHERE TRIM(LOWER(libelle_matiere)) = TRIM(LOWER($1))
    `, [libelle]);
    if (existe.length > 0)
      return res.json({ ok: false, erreur: "⚠️ Cette matière existe DÉJÀ" });

    // ✅ Récupération prochain ID
    const { rows: [{ prochain_id }] } = await pool.query(`
      SELECT COALESCE(MAX(id_matiere), 0) + 1 AS prochain_id 
      FROM matieres
    `);

    // ✅ Insertion
    await pool.query(`
      INSERT INTO matieres(
        id_matiere, libelle_matiere, libelle_matiere_ar,
        coefficient, volume_horaire, langue_ens
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [prochain_id, libelle, libelle_ar, coef, vol, langue]);

    console.log(`✅ Matière créée — "${libelle}" (ID: ${prochain_id})`);
    return res.json({ ok: true, message: "✅ Matière CRÉÉE avec succès", id_matiere: prochain_id });
  } catch (e) {
    console.error("❌ ERREUR création matière :", e.code, e.message);
    return res.json({ 
      ok: false, 
      erreur: e.code === '23505' ? "⚠️ Doublon détecté" : "⚠️ Impossible de créer la matière" 
    });
  }
});

// ==================================================
// ✏️ MODIFIER UNE MATIÈRE — Admin seulement
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { libelle_matiere, libelle_matiere_ar, coefficient, volume_horaire, langue_ens } = req.body;

    if (!libelle_matiere?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de la matière OBLIGATOIRE" });

    // ✅ Valeurs nettoyées et validées
    const libelle = libelle_matiere.trim();
    const libelle_ar = libelle_matiere_ar?.trim() || null;
    const coef = !isNaN(parseFloat(coefficient)) ? Math.max(1, parseFloat(coefficient)) : 1;
    const vol = !isNaN(parseInt(volume_horaire)) ? Math.max(1, parseInt(volume_horaire)) : 3;
    const langue = ['fr', 'ar', 'en'].includes(langue_ens?.toLowerCase()) ? langue_ens.toLowerCase() : 'fr';

    // ✅ Vérification doublon (hors elle-même)
    const { rows: existe } = await pool.query(`
      SELECT id_matiere 
      FROM matieres 
      WHERE TRIM(LOWER(libelle_matiere)) = TRIM(LOWER($1)) AND id_matiere <> $2
    `, [libelle, id_matiere]);
    if (existe.length > 0)
      return res.json({ ok: false, erreur: "⚠️ Une autre matière porte déjà ce nom" });

    // ✅ Mise à jour
    const { rowCount } = await pool.query(`
      UPDATE matieres SET
        libelle_matiere = $1,
        libelle_matiere_ar = $2,
        coefficient = $3,
        volume_horaire = $4,
        langue_ens = $5
      WHERE id_matiere = $6
    `, [libelle, libelle_ar, coef, vol, langue, id_matiere]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Matière INTROUVABLE" });

    console.log(`✅ Matière modifiée — "${libelle}" (ID: ${id_matiere})`);
    return res.json({ ok: true, message: "✅ Matière MODIFIÉE avec succès" });
  } catch (e) {
    console.error("❌ ERREUR modification matière :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de modifier la matière" });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UNE MATIÈRE — Admin seulement
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rowCount } = await pool.query(
      'DELETE FROM matieres WHERE id_matiere = $1',
      [id_matiere]
    );

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Matière INTROUVABLE" });

    console.log(`🗑️ Matière supprimée — ID: ${id_matiere}`);
    return res.json({ ok: true, message: "✅ Matière SUPPRIMÉE définitivement" });
  } catch (e) {
    console.error("❌ ERREUR suppression matière :", e.code, e.message);
    if (e.code === '23503') // Clé étrangère
      return res.json({ 
        ok: false, 
        erreur: "⚠️ IMPOSSIBLE : utilisée dans des notes, affectations ou emplois du temps" 
      });
    return res.json({ ok: false, erreur: "⚠️ Impossible de supprimer la matière" });
  }
});

module.exports = router;