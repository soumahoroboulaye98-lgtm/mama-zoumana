const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifprof = require('../middleware/verifprof');

// ==================================================
// ✅ MES CLASSES AFFECTÉES AU PROF — CORRIGÉE
// Utilise la table "affectations_ens" conforme à ta base
// ==================================================
router.get('/mes-classes', verifprof, async (req, res) => {
  try {
    const id_prof = req.user.id_utilisateur;
    console.log("🔍 Chargement classes pour ID Prof =", id_prof);

    const r = await pool.query(`
      SELECT DISTINCT c.id_classe, c.libelle_classe, c.cycle, c.capacite_max, c.statut
      FROM classes c
      INNER JOIN affectations_ens a ON c.id_classe = a.id_classe
      WHERE a.id_prof = $1
      ORDER BY c.libelle_classe
    `, [id_prof]);

    console.log("✅ Classes trouvées :", r.rows.length, r.rows);
    res.json({ ok: true, classes: r.rows });
  } catch (e) {
    console.log("❌ ERREUR CHARGEMENT CLASSES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 👥 ÉLÈVES D'UNE CLASSE — CORRIGÉE
// Colonnes existantes dans ta base : pas de "niveau", utilise "libelle_classe"
// ==================================================
router.get('/eleves-classe/:id_classe', verifprof, async (req, res) => {
  try {
    const { id_classe } = req.params;
    const r = await pool.query(`
      SELECT 
        u.id_utilisateur AS id_eleve,
        u.nom,
        u.prenoms,
        u.matricule,
        u.photo_profil AS photo_eleve,
        c.libelle_classe,
        c.cycle
      FROM utilisateurs u
      JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.role = 'eleve' 
        AND u.id_classe = $1
      ORDER BY u.nom, u.prenoms
    `, [id_classe]);

    res.json({ ok: true, eleves: r.rows });
  } catch (e) {
    console.log("❌ ERREUR ÉLÈVES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 💾 ENREGISTRER / MODIFIER LES PRÉSENCES
// Colonne de contrainte : (id_eleve, id_classe, date_jour)
// ==================================================
router.post('/marquer', verifprof, async (req, res) => {
  try {
    const { id_classe, date_jour, presences, signature_prof, annee_scolaire, trimestre } = req.body;
    const id_prof = req.user.id_utilisateur;

    // ✅ Validation des champs obligatoires
    if (!id_classe || !date_jour || !presences || presences.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Classe, Date et Liste élèves sont obligatoires" });
    }

    // ✅ Enregistre chaque présence
    for (const p of presences) {
      await pool.query(`
        INSERT INTO presences(
          id_eleve, id_classe, date_jour, statut, justification, 
          id_prof, signature_prof, annee_scolaire, trimestre
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id_eleve, id_classe, date_jour) DO UPDATE SET
          statut = EXCLUDED.statut,
          justification = EXCLUDED.justification,
          signature_prof = EXCLUDED.signature_prof
      `, [
        p.id_eleve, id_classe, date_jour, p.statut, p.justification || null,
        id_prof, signature_prof || null, annee_scolaire || null, trimestre || null
      ]);
    }

    res.json({ 
      ok: true, 
      message: `✅ ${presences.length} présence(s) enregistrée(s) !`,
      details: { id_classe, date_jour, nombre_eleves: presences.length }
    });
  } catch (e) {
    console.log("❌ ERREUR ENREGISTREMENT PRÉSENCES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📖 CHARGER LES PRÉSENCES EXISTANTES POUR UNE CLASSE & UNE DATE
// ==================================================
router.post('/liste', verifprof, async (req, res) => {
  try {
    const { id_classe, date_jour } = req.body;

    if (!id_classe || !date_jour) {
      return res.json({ ok: false, erreur: "Classe et Date sont obligatoires" });
    }

    const r = await pool.query(`
      SELECT 
        p.id_eleve, p.statut, p.justification, p.signature_prof,
        p.annee_scolaire, p.trimestre,
        u.nom, u.prenoms, u.matricule, u.photo_profil
      FROM presences p
      JOIN utilisateurs u ON p.id_eleve = u.id_utilisateur
      WHERE p.id_classe = $1 AND p.date_jour = $2
      ORDER BY u.nom, u.prenoms
    `, [id_classe, date_jour]);

    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.log("ℹ️ Aucune présence existante :", e.message);
    res.json({ ok: true, lignes: [] });
  }
});

module.exports = router;