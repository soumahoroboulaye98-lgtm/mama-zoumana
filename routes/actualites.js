const express = require('express');
const router = express.Router();
const pool = require('../db');

// ==================================================
// 🔐 MIDDLEWARES DE PROTECTION
// ==================================================
let veriftoken, verifadmin, protegerAdmin;
try {
  veriftoken = require('../middleware/veriftoken');
  verifadmin = require('../middleware/verifadmin');
  protegerAdmin = [veriftoken, verifadmin];
} catch {
  protegerAdmin = [];
}

// ==================================================
// 📅 ANNÉE SCOLAIRE AUTOMATIQUE
// ==================================================
function getAnneeScolaire() {
  const aujourdHui = new Date();
  const annee = aujourdHui.getFullYear();
  const mois = aujourdHui.getMonth() + 1;
  return mois >= 9 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
}
function getAnneeSimple() {
  return new Date().getFullYear().toString();
}

// ==================================================
// 🏠 ACCUEIL
// ==================================================
router.get('/accueil', async (req, res) => {
  try {
    const annee_scolaire = getAnneeScolaire();
    const { rows: epinglees } = await pool.query(`
      SELECT id, titre_fr, titre_en, titre_ar,
             resume_fr, resume_en, resume_ar,
             image_principale, categorie, date_publication,
             rentree, annee_scolaire
      FROM actualites
      WHERE est_publie = true AND epingle = true
      ORDER BY date_publication DESC LIMIT 5
    `);
    const { rows: dernieres } = await pool.query(`
      SELECT id, titre_fr, titre_en, titre_ar,
             resume_fr, resume_en, resume_ar,
             image_principale, categorie, date_publication,
             rentree, annee_scolaire
      FROM actualites
      WHERE est_publie = true AND epingle = false
      ORDER BY date_publication DESC LIMIT 8
    `);
    const { rows: categories } = await pool.query(`
      SELECT DISTINCT categorie FROM actualites
      WHERE est_publie = true ORDER BY categorie
    `);
    return res.json({
      ok: true,
      annee_scolaire,
      epinglees,
      dernieres,
      categories: categories.map(c => c.categorie)
    });
  } catch (e) {
    console.error("❌ ERREUR ACCUEIL :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger les actualités" });
  }
});

// ==================================================
// 📋 LISTE — /api/actualites/liste
// ==================================================
router.get('/liste', async (req, res) => {
  try {
    const { tout, categorie, rentree, annee_scolaire } = req.query;
    const conditions = [];
    const valeurs = [];

    if (tout !== '1') conditions.push('est_publie = true');
    if (categorie?.trim()) {
      valeurs.push(categorie.trim());
      conditions.push(`categorie = $${valeurs.length}`);
    }
    if (rentree === '1' || rentree === 'true') conditions.push('rentree = true');

    const annee_defaut = annee_scolaire?.trim() || getAnneeScolaire();
    if (annee_scolaire) {
      valeurs.push(annee_defaut);
      conditions.push(`annee_scolaire = $${valeurs.length}`);
    }

    const clauseWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(`
      SELECT id, titre_fr, titre_en, titre_ar,
             resume_fr, resume_en, resume_ar,
             image_principale, categorie, est_publie, epingle,
             date_publication, date_creation, annee_scolaire
      FROM actualites
      ${clauseWhere}
      ORDER BY epingle DESC, date_publication DESC
    `, valeurs);

    return res.json({ ok: true, actualites: rows, lignes: rows, annee_scolaire: annee_defaut });
  } catch (e) {
    console.error("❌ ERREUR LISTE :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de charger les actualités" });
  }
});

// ==================================================
// 🔍 DÉTAIL PAR ID
// ==================================================
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    const { rows: [actualite] } = await pool.query(`
      SELECT * FROM actualites WHERE id = $1 AND est_publie = true
    `, [id]);
    if (!actualite) return res.json({ ok: false, erreur: "⚠️ Actualité introuvable" });
    return res.json({ ok: true, actualite });
  } catch (e) {
    console.error("❌ ERREUR DÉTAIL :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Erreur serveur" });
  }
});

// ==================================================
// ➕ ENREGISTRER — /api/actualites/enregistrer
// ==================================================
router.post('/enregistrer', protegerAdmin, async (req, res) => {
  try {
    const id_utilisateur = req.user?.id_utilisateur || req.user?.id;
    const annee_scolaire_auto = getAnneeScolaire();
    const annee_auto = getAnneeSimple();

    const {
      titre_fr, titre_en, titre_ar,
      resume_fr, resume_en, resume_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_principale, categorie,
      est_publie, epingle, date_publication,
      rentree, annee_scolaire, annee
    } = req.body;

    if (!titre_fr?.trim())
      return res.json({ ok: false, erreur: "⚠️ Le titre en français est obligatoire" });
    if (!contenu_fr?.trim())
      return res.json({ ok: false, erreur: "⚠️ Le contenu en français est obligatoire" });

    const donnees = {
      titre_fr: titre_fr.trim(),
      titre_en: titre_en?.trim() || null,
      titre_ar: titre_ar?.trim() || null,
      resume_fr: resume_fr?.trim() || null,
      resume_en: resume_en?.trim() || null,
      resume_ar: resume_ar?.trim() || null,
      contenu_fr: contenu_fr.trim(),
      contenu_en: contenu_en?.trim() || null,
      contenu_ar: contenu_ar?.trim() || null,
      image_principale: image_principale?.trim() || null,
      categorie: categorie?.trim() || 'general',
      est_publie: est_publie !== false,
      epingle: epingle === true,
      date_publication: date_publication || new Date(),
      rentree: rentree === true,
      annee_scolaire: annee_scolaire?.trim() || annee_scolaire_auto,
      annee: annee?.trim() || annee_auto
    };

    const { rows: [nouvelle] } = await pool.query(`
      INSERT INTO actualites(
        titre_fr, titre_en, titre_ar,
        resume_fr, resume_en, resume_ar,
        contenu_fr, contenu_en, contenu_ar,
        image_principale, categorie, est_publie, epingle,
        date_publication, rentree, annee_scolaire, annee,
        id_utilisateur, date_creation, date_modification
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      RETURNING *
    `, [
      donnees.titre_fr, donnees.titre_en, donnees.titre_ar,
      donnees.resume_fr, donnees.resume_en, donnees.resume_ar,
      donnees.contenu_fr, donnees.contenu_en, donnees.contenu_ar,
      donnees.image_principale, donnees.categorie, donnees.est_publie, donnees.epingle,
      donnees.date_publication, donnees.rentree, donnees.annee_scolaire, donnees.annee,
      id_utilisateur
    ]);

    console.log(`✅ Actualité créée — "${donnees.titre_fr}"`);
    return res.json({ ok: true, actualite: nouvelle, message: "✅ Actualité ajoutée avec succès" });
  } catch (e) {
    console.error("❌ ERREUR CRÉATION :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de créer l'actualité : " + e.message });
  }
});

// ==================================================
// ✏️ MODIFIER — /api/actualites/:id
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    const id_utilisateur = req.user?.id_utilisateur || req.user?.id;

    const {
      titre_fr, titre_en, titre_ar,
      resume_fr, resume_en, resume_ar,
      contenu_fr, contenu_en, contenu_ar,
      image_principale, categorie,
      est_publie, epingle, date_publication,
      rentree, annee_scolaire, annee
    } = req.body;

    if (!titre_fr?.trim())
      return res.json({ ok: false, erreur: "⚠️ Le titre en français est obligatoire" });
    if (!contenu_fr?.trim())
      return res.json({ ok: false, erreur: "⚠️ Le contenu en français est obligatoire" });

    const annee_scolaire_auto = getAnneeScolaire();
    const annee_auto = getAnneeSimple();

    const donnees = {
      titre_fr: titre_fr.trim(),
      titre_en: titre_en?.trim() || null,
      titre_ar: titre_ar?.trim() || null,
      resume_fr: resume_fr?.trim() || null,
      resume_en: resume_en?.trim() || null,
      resume_ar: resume_ar?.trim() || null,
      contenu_fr: contenu_fr.trim(),
      contenu_en: contenu_en?.trim() || null,
      contenu_ar: contenu_ar?.trim() || null,
      image_principale: image_principale?.trim() || null,
      categorie: categorie?.trim() || 'general',
      est_publie: est_publie !== false,
      epingle: epingle === true,
      date_publication: date_publication || new Date(),
      rentree: rentree === true,
      annee_scolaire: annee_scolaire?.trim() || annee_scolaire_auto,
      annee: annee?.trim() || annee_auto
    };

    const { rows: [modifiee] } = await pool.query(`
      UPDATE actualites SET
        titre_fr = $2, titre_en = $3, titre_ar = $4,
        resume_fr = $5, resume_en = $6, resume_ar = $7,
        contenu_fr = $8, contenu_en = $9, contenu_ar = $10,
        image_principale = $11, categorie = $12,
        est_publie = $13, epingle = $14,
        date_publication = $15, rentree = $16,
        annee_scolaire = $17, annee = $18,
        id_utilisateur = COALESCE($19, id_utilisateur),
        date_modification = NOW()
      WHERE id = $1
      RETURNING *
    `, [
      id,
      donnees.titre_fr, donnees.titre_en, donnees.titre_ar,
      donnees.resume_fr, donnees.resume_en, donnees.resume_ar,
      donnees.contenu_fr, donnees.contenu_en, donnees.contenu_ar,
      donnees.image_principale, donnees.categorie, donnees.est_publie, donnees.epingle,
      donnees.date_publication, donnees.rentree, donnees.annee_scolaire, donnees.annee,
      id_utilisateur
    ]);

    if (!modifiee) return res.json({ ok: false, erreur: "⚠️ Actualité introuvable" });
    console.log(`✅ Actualité mise à jour — ID: ${id}`);
    return res.json({ ok: true, actualite: modifiee, message: "✅ Actualité mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de modifier : " + e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER — /api/actualites/:id
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    const { rows: [supprimee] } = await pool.query(
      'DELETE FROM actualites WHERE id = $1 RETURNING titre_fr',
      [id]
    );
    if (!supprimee) return res.json({ ok: false, erreur: "⚠️ Actualité introuvable" });
    console.log(`🗑️ Actualité supprimée — ID: ${id}`);
    return res.json({ ok: true, message: "✅ Actualité supprimée définitivement" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Impossible de supprimer" });
  }
});

// ==================================================
// 📅 RENTRÉE ACTUELLE
// ==================================================
router.get('/rentree/actuelle', async (req, res) => {
  try {
    const annee_scolaire = getAnneeScolaire();
    const { rows: [rentree] } = await pool.query(`
      SELECT id, titre_fr, titre_en, titre_ar,
             resume_fr, date_publication, annee_scolaire
      FROM actualites
      WHERE rentree = true AND annee_scolaire = $1 AND est_publie = true
      ORDER BY date_publication DESC LIMIT 1
    `, [annee_scolaire]);
    return res.json({ ok: true, rentree: rentree || null, annee_scolaire });
  } catch (e) {
    console.error("❌ ERREUR RENTRÉE :", e.code, e.message);
    return res.json({ ok: false, erreur: "⚠️ Erreur chargement rentrée" });
  }
});

module.exports = router;