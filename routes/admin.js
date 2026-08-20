const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection groupée uniforme
const protegerAdmin = [veriftoken, verifadmin];


// ==================================================
// 📊 STATISTIQUES GLOBALES
// ==================================================
router.get('/statistiques', protegerAdmin, async (req, res) => {
  try {
    const classes = await pool.query(`SELECT COUNT(*) FROM classes`);
    const eleves = await pool.query(`SELECT COUNT(*) FROM utilisateurs WHERE role = 'eleve'`);
    const profs = await pool.query(`SELECT COUNT(*) FROM utilisateurs WHERE role = 'prof'`);

    let attente = 0;
    try {
      const r = await pool.query(`SELECT COUNT(*) FROM preinscriptions WHERE statut_preinscription = 'en_attente'`);
      attente = parseInt(r.rows[0].count, 10);
    } catch { attente = 0; }

    let totalPaiements = 0, paiementsEnAttente = 0;
    try {
      const paye = await pool.query(`SELECT COALESCE(SUM(montant_paye), 0) AS total FROM paiements`);
      const enAtt = await pool.query(`SELECT COUNT(*) FROM frais_scolaires WHERE statut = 'impaye'`);
      totalPaiements = parseFloat(paye.rows[0].total) || 0;
      paiementsEnAttente = parseInt(enAtt.rows[0].count, 10);
    } catch { totalPaiements = 0; paiementsEnAttente = 0; }

    console.log("✅ Statistiques consultées");
    res.json({
      ok: true,
      stats: {
        classes: parseInt(classes.rows[0].count, 10),
        eleves: parseInt(eleves.rows[0].count, 10),
        profs: parseInt(profs.rows[0].count, 10),
        attente,
        totalPaiements,
        paiementsEnAttente
      }
    });
  } catch (e) {
    console.error("❌ ERREUR STATS :", e.message);
    res.json({
      ok: false,
      erreur: "Erreur serveur : " + e.message,
      stats: { classes: 0, eleves: 0, profs: 0, attente: 0, totalPaiements: 0, paiementsEnAttente: 0 }
    });
  }
});


// ==================================================
// 📋 DERNIÈRES INSCRIPTIONS
// ==================================================
router.get('/dernieres-inscriptions', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_utilisateur, nom, prenoms, email, role, date_creation
      FROM utilisateurs
      WHERE role = 'eleve'
      ORDER BY date_creation DESC
      LIMIT 5
    `);
    console.log("✅ Dernières inscriptions consultées");
    res.json({ ok: true, inscriptions: r.rows });
  } catch (e) {
    console.error("❌ ERREUR DERNIÈRES INSCRIPTIONS :", e.message);
    res.json({ ok: false, inscriptions: [] });
  }
});


// ==================================================
// ⚠️ ALERTES DU SYSTÈME
// ==================================================
router.get('/alertes', protegerAdmin, async (req, res) => {
  const alertes = [];
  try {
    const sansClasse = await pool.query(`
      SELECT COUNT(*) FROM utilisateurs 
      WHERE role = 'eleve' AND (id_classe IS NULL OR id_classe = 0)
    `);
    const nbSansClasse = parseInt(sansClasse.rows[0].count, 10);
    if (nbSansClasse > 0) {
      alertes.push({
        type: 'warning',
        icone: 'bi-exclamation-triangle',
        message: nbSansClasse === 1
          ? "⚠️ 1 élève n'a pas de classe affectée"
          : `⚠️ ${nbSansClasse} élèves n'ont pas de classe affectée`
      });
    }
  } catch {}

  try {
    const sansAffectation = await pool.query(`
      SELECT COUNT(DISTINCT u.id_utilisateur) 
      FROM utilisateurs u
      LEFT JOIN affectations_ens a ON u.id_utilisateur = a.id_prof
      WHERE u.role = 'prof' AND a.id_prof IS NULL
    `);
    const nbSansAff = parseInt(sansAffectation.rows[0].count, 10);
    if (nbSansAff > 0) {
      alertes.push({
        type: 'info',
        icone: 'bi-person-x',
        message: nbSansAff === 1
          ? "ℹ️ 1 enseignant sans affectation"
          : `ℹ️ ${nbSansAff} enseignants sans affectation`
      });
    }
  } catch {}

  console.log(`✅ Alertes consultées — ${alertes.length} alerte(s)`);
  res.json({ ok: true, alertes });
});


// ==================================================
// 📈 RÉPARTITION DES ÉLÈVES PAR CLASSE
// ==================================================
router.get('/repartition-eleves', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT c.libelle_classe, COUNT(u.id_utilisateur) AS nombre
      FROM classes c
      LEFT JOIN utilisateurs u ON c.id_classe = u.id_classe AND u.role = 'eleve'
      GROUP BY c.id_classe, c.libelle_classe
      ORDER BY c.libelle_classe
      LIMIT 8
    `);
    console.log("✅ Répartition élèves consultée");
    res.json({ ok: true, repartition: r.rows });
  } catch (e) {
    console.error("❌ ERREUR RÉPARTITION :", e.message);
    res.json({ ok: false, repartition: [] });
  }
});


// ==================================================
// 📄 ÉTAT DES NOTES & BULLETINS
// ==================================================
router.get('/etat-bulletins', protegerAdmin, async (req, res) => {
  try {
    let notesSaisies = 0, bulletinsGeneres = 0;
    try {
      const notes = await pool.query(`SELECT COUNT(*) AS total FROM notes`);
      notesSaisies = parseInt(notes.rows[0].total, 10);
    } catch { notesSaisies = 0; }

    try {
      const bulletins = await pool.query(`SELECT COUNT(*) AS total FROM bulletins`);
      bulletinsGeneres = parseInt(bulletins.rows[0].total, 10);
    } catch { bulletinsGeneres = 0; }

    console.log("✅ État bulletins consulté");
    res.json({ ok: true, notesSaisies, bulletinsGeneres });
  } catch (e) {
    console.error("❌ ERREUR ÉTAT BULLETINS :", e.message);
    res.json({ ok: false, notesSaisies: 0, bulletinsGeneres: 0 });
  }
});


// ==================================================
// 🕐 ACTIVITÉ RÉCENTE
// ==================================================
router.get('/activite-recente', protegerAdmin, async (req, res) => {
  const activite = [];
  try {
    const r = await pool.query(`
      SELECT id_utilisateur, nom, prenoms, role, date_creation
      FROM utilisateurs
      ORDER BY date_creation DESC
      LIMIT 5
    `);
    r.rows.forEach(u => {
      const roleLabel = {
        admin: 'Administrateur',
        prof: 'Enseignant',
        eleve: 'Élève'
      }[u.role] || u.role;

      activite.push({
        icone: u.role === 'eleve' ? 'bi-person' : u.role === 'prof' ? 'bi-person-badge' : 'bi-shield-lock',
        texte: `${roleLabel} : ${u.nom} ${u.prenoms}`,
        date: u.date_creation
      });
    });
    console.log("✅ Activité récente consultée");
  } catch {}
  res.json({ ok: true, activite });
});


// ==================================================
// ⚙️ CONFIGURATION DU SITE
// ==================================================

// Lire la configuration (Admin)
router.get('/config-site', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT cle, valeur FROM configuration_site ORDER BY cle`);
    const config = {};
    r.rows.forEach(row => { config[row.cle] = row.valeur; });
    console.log("✅ Configuration consultée");
    res.json({ ok: true, config });
  } catch (e) {
    console.error("❌ ERREUR LECTURE CONFIG :", e.message);
    res.json({ ok: false, config: {} });
  }
});

// ✅ Lire la configuration PUBLIQUE
router.get('/site/config', async (req, res) => {
  try {
    const r = await pool.query(`SELECT cle, valeur FROM configuration_site`);
    const config = {};
    r.rows.forEach(row => { config[row.cle] = row.valeur; });
    res.json({ ok: true, config });
  } catch (e) {
    console.error("❌ ERREUR CONFIG PUBLIQUE :", e.message);
    res.json({ ok: true, config: {} });
  }
});

// ✅ Mettre à jour la configuration
router.post('/config-site', protegerAdmin, async (req, res) => {
  try {
    const { config } = req.body;
    if (!config || typeof config !== 'object') {
      return res.json({ ok: false, erreur: "⚠️ Configuration invalide" });
    }
    for (const [cle, valeur] of Object.entries(config)) {
      await pool.query(`
        INSERT INTO configuration_site (cle, valeur, date_mise_a_jour)
        VALUES ($1, $2, NOW())
        ON CONFLICT (cle)
        DO UPDATE SET valeur = $2, date_mise_a_jour = NOW()
      `, [cle, valeur]);
    }
    console.log("✅ Configuration mise à jour");
    res.json({ ok: true, message: "✅ Configuration sauvegardée" });
  } catch (e) {
    console.error("❌ ERREUR SAUVEGARDE CONFIG :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});


// ==================================================
// 📢 ANNONCES (Routes tableau de bord)
// ==================================================

// Lire toutes les annonces (Admin)
router.get('/annonces', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM annonces ORDER BY ordre ASC, date_creation DESC`);
    console.log(`✅ Liste annonces (admin) consultée — ${r.rows.length} annonce(s)`);
    res.json({ ok: true, annonces: r.rows });
  } catch (e) {
    console.error("❌ ERREUR LECTURE ANNONCES :", e.message);
    res.json({ ok: false, annonces: [] });
  }
});

// ✅ Lire annonces PUBLIQUES
router.get('/site/annonces', async (req, res) => {
  try {
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const r = await pool.query(`
      SELECT * FROM annonces
      WHERE est_publie = true
      AND (date_publication IS NULL OR date_publication <= $1)
      AND (date_expiration IS NULL OR date_expiration >= $1)
      ORDER BY ordre ASC, date_creation DESC
    `, [aujourdHui]);
    res.json({ ok: true, annonces: r.rows });
  } catch (e) {
    console.error("❌ ERREUR ANNONCES PUBLIQUES :", e.message);
    res.json({ ok: true, annonces: [] });
  }
});

// Ajouter une annonce
router.post('/annonces', protegerAdmin, async (req, res) => {
  try {
    const {
      titre_fr, titre_en, titre_ar, contenu_fr, contenu_en, contenu_ar,
      date_publication, date_expiration, ordre, est_actif, est_publie
    } = req.body;

    if (!titre_fr || !titre_fr.trim() || !contenu_fr || !contenu_fr.trim()) {
      return res.json({ ok: false, erreur: "⚠️ Le titre et le contenu en français sont obligatoires" });
    }

    const r = await pool.query(`
      INSERT INTO annonces (
        titre_fr, titre_en, titre_ar, contenu_fr, contenu_en, contenu_ar,
        date_publication, date_expiration, ordre, est_actif, est_publie
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      titre_fr.trim(), titre_en?.trim() || null, titre_ar?.trim() || null,
      contenu_fr.trim(), contenu_en?.trim() || null, contenu_ar?.trim() || null,
      date_publication || new Date(), date_expiration || null,
      ordre || 1, est_actif !== false, est_publie !== false
    ]);

    console.log(`✅ Annonce créée (tableau de bord) — "${titre_fr}"`);
    res.json({ ok: true, annonce: r.rows[0], message: "✅ Annonce ajoutée" });
  } catch (e) {
    console.error("❌ ERREUR CRÉATION ANNONCE :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// Modifier une annonce
router.put('/annonces/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const {
      titre_fr, titre_en, titre_ar, contenu_fr, contenu_en, contenu_ar,
      date_expiration, ordre, est_actif, est_publie
    } = req.body;

    if (!titre_fr || !titre_fr.trim() || !contenu_fr || !contenu_fr.trim()) {
      return res.json({ ok: false, erreur: "⚠️ Le titre et le contenu en français sont obligatoires" });
    }

    const r = await pool.query(`
      UPDATE annonces
      SET titre_fr = $1, titre_en = $2, titre_ar = $3,
          contenu_fr = $4, contenu_en = $5, contenu_ar = $6,
          date_expiration = $7, ordre = $8, est_actif = $9, est_publie = $10, date_mise_a_jour = NOW()
      WHERE id_annonce = $11
      RETURNING *
    `, [
      titre_fr.trim(), titre_en?.trim() || null, titre_ar?.trim() || null,
      contenu_fr.trim(), contenu_en?.trim() || null, contenu_ar?.trim() || null,
      date_expiration || null, ordre || 1, est_actif !== false, est_publie !== false, id
    ]);

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Annonce introuvable" });
    }
    console.log(`✅ Annonce mise à jour (tableau de bord) — ID: ${id}`);
    res.json({ ok: true, annonce: r.rows[0], message: "✅ Annonce mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR MODIFICATION ANNONCE :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});

// Supprimer une annonce
router.delete('/annonces/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });
    }

    const r = await pool.query(
      'DELETE FROM annonces WHERE id_annonce = $1 RETURNING titre_fr',
      [id]
    );

    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Annonce introuvable" });
    }
    console.log(`✅ Annonce supprimée (tableau de bord) — ID: ${id}, "${r.rows[0].titre_fr}"`);
    res.json({ ok: true, message: "✅ Annonce supprimée" });
  } catch (e) {
    console.error("❌ ERREUR SUPPRESSION ANNONCE :", e.message);
    res.json({ ok: false, erreur: "Erreur serveur : " + e.message });
  }
});


module.exports = router;