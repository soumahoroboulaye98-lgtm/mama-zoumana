const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection uniforme
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 🔧 GÉNÉRER UN MATRICULE — Format : MZ-AAAA-PREFIX-NNNN
// ==================================================
async function genererMatricule(role) {
  const annee = new Date().getFullYear();
  const prefixes = {
    admin: 'ADM', directeur: 'DIR', comptable: 'CMP',
    professeur: 'PRF', eleve: 'ELE', parent: 'PAR',
    visiteur: 'VIS', secretaire: 'SEC'
  };
  const pref = prefixes[role] || 'USR';
  const compte = await pool.query(
    "SELECT COUNT(*) FROM utilisateurs WHERE matricule LIKE $1",
    [`MZ-${annee}-${pref}-%`]
  );
  const num = String(parseInt(compte.rows[0].count) + 1).padStart(4, '0');
  return `MZ-${annee}-${pref}-${num}`;
}

// ==================================================
// 📊 CALCUL MOYENNE / RANG / MENTION — SANS id_classe
// ==================================================
async function calculerResultatsEleve(id_eleve, anneeScolaire) {
  try {
    const notes = await pool.query(`
      SELECT n.valeur, m.coefficient
      FROM notes n
      JOIN matieres m ON n.id_matiere = m.id_matiere
      WHERE n.id_eleve = $1 AND n.annee_scolaire = $2
    `, [id_eleve, anneeScolaire]);

    if (notes.rows.length === 0) {
      return { moyenne: null, rang: null, mention: 'Sans note' };
    }

    // ✅ Moyenne pondérée
    let totalPoints = 0, totalCoef = 0;
    notes.rows.forEach(n => {
      totalPoints += (parseFloat(n.valeur) || 0) * parseFloat(n.coefficient || 1);
      totalCoef += parseFloat(n.coefficient || 1);
    });
    const moyenne = totalCoef > 0 ? Math.round((totalPoints / totalCoef) * 100) / 100 : null;

    // ✅ Rang calculé sur TOUTES les notes de l'année
    const tousEleves = await pool.query(`
      SELECT DISTINCT n.id_eleve
      FROM notes n
      WHERE n.annee_scolaire = $1
    `, [anneeScolaire]);

    const moyennesClasse = [];
    for (const e of tousEleves.rows) {
      const eNotes = await pool.query(`
        SELECT n.valeur, m.coefficient
        FROM notes n JOIN matieres m ON n.id_matiere = m.id_matiere
        WHERE n.id_eleve = $1 AND n.annee_scolaire = $2
      `, [e.id_eleve, anneeScolaire]);
      let pts = 0, cf = 0;
      eNotes.rows.forEach(n => {
        pts += (parseFloat(n.valeur) || 0) * parseFloat(n.coefficient || 1);
        cf += parseFloat(n.coefficient || 1);
      });
      const m = cf > 0 ? Math.round((pts / cf) * 100) / 100 : 0;
      moyennesClasse.push({ id_eleve: e.id_eleve, moyenne: m });
    }

    moyennesClasse.sort((a, b) => b.moyenne - a.moyenne);
    const rang = moyennesClasse.findIndex(x => x.id_eleve === id_eleve) + 1;

    // ✅ Mention
    let mention = 'Insuffisant';
    if (moyenne >= 17) mention = 'Excellent';
    else if (moyenne >= 15) mention = 'Très Bien';
    else if (moyenne >= 13) mention = 'Bien';
    else if (moyenne >= 11) mention = 'Assez Bien';
    else if (moyenne >= 10) mention = 'Passable';

    return { moyenne, rang, mention };
  } catch (e) {
    console.log("⚠️ Calcul résultats impossible :", e.message);
    return { moyenne: null, rang: null, mention: null };
  }
}

// ==================================================
// 📋 LISTE DES PROFESSEURS
// ==================================================
router.get('/professeurs', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nom, prenom, email, telephone, matricule
      FROM utilisateurs
      WHERE role = 'professeur' AND COALESCE(est_actif, true) = true
      ORDER BY nom, prenom
    `);
    res.json({ ok: true, utilisateurs: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE PROFS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE ÉLÈVES
// ==================================================
router.get('/eleves', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.id, u.nom, u.prenom, u.email, u.matricule,
             u.date_naissance
      FROM utilisateurs u
      WHERE u.role = 'eleve' AND COALESCE(u.est_actif, true) = true
      ORDER BY u.nom, u.prenom
    `);
    res.json({ ok: true, utilisateurs: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE ÉLÈVES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE PARENTS
// ==================================================
router.get('/parents', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nom, prenom, email, telephone, matricule
      FROM utilisateurs
      WHERE role = 'parent' AND COALESCE(est_actif, true) = true
      ORDER BY nom, prenom
    `);
    res.json({ ok: true, utilisateurs: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE PARENTS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE COMPTABLES
// ==================================================
router.get('/comptables', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nom, prenom, email, telephone, matricule
      FROM utilisateurs
      WHERE role = 'comptable' AND COALESCE(est_actif, true) = true
      ORDER BY nom, prenom
    `);
    res.json({ ok: true, utilisateurs: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE COMPTABLES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE SECRÉTAIRES
// ==================================================
router.get('/secretaires', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nom, prenom, email, telephone, matricule
      FROM utilisateurs
      WHERE role = 'secretaire' AND COALESCE(est_actif, true) = true
      ORDER BY nom, prenom
    `);
    res.json({ ok: true, utilisateurs: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE SECRÉTAIRES :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE TOUS LES UTILISATEURS (avec filtres)
// ==================================================
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const { role, recherche } = req.query;
    let conditions = [], valeurs = [], idx = 1;
    if (role) {
      conditions.push(`role = $${idx++}`);
      valeurs.push(role);
    }
    conditions.push(`COALESCE(est_actif, true) = true`);
    if (recherche) {
      conditions.push(`(nom ILIKE $${idx} OR prenom ILIKE $${idx} OR email ILIKE $${idx} OR matricule ILIKE $${idx})`);
      valeurs.push(`%${recherche}%`);
      idx++;
    }
    const clause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const r = await pool.query(`
      SELECT id, nom, prenom, email, telephone, role, matricule,
             COALESCE(est_actif, true) AS est_actif, date_creation
      FROM utilisateurs
      ${clause} ORDER BY nom, prenom
    `, valeurs);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE UTILISATEURS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🔍 UN SEUL UTILISATEUR PAR ID
// ==================================================
router.get('/:id', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM utilisateurs WHERE id = $1', [req.params.id]);
    if (!r.rows.length) return res.json({ ok: false, erreur: "Utilisateur introuvable" });
    res.json({ ok: true, utilisateur: r.rows[0] });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ➕ CRÉER UN UTILISATEUR PAR L'ADMIN — SANS id_classe
// ==================================================
router.post('/creer-admin', protegerAdmin, async (req, res) => {
  try {
    const {
      nom, prenom, email, telephone, role,
      date_naissance, lieu_naissance,
      nom_pere, nom_mere, telephone_pere, telephone_mere,
      annee_scolaire
    } = req.body;

    // ✅ Validation
    if (!nom || !prenom || !email || !role) {
      return res.json({ ok: false, erreur: "⚠️ Nom, Prénom, Email et Rôle sont obligatoires" });
    }
    const rolesAutorises = ['admin', 'professeur', 'eleve', 'parent', 'visiteur', 'comptable', 'secretaire', 'directeur'];
    if (!rolesAutorises.includes(role)) {
      return res.json({ ok: false, erreur: "⚠️ Rôle invalide" });
    }

    // Email unique
    const emailNettoye = email.trim().toLowerCase();
    const exist = await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [emailNettoye]);
    if (exist.rows.length) return res.json({ ok: false, erreur: "⚠️ Cet email existe déjà" });

    // Générer matricule SANS id_classe
    const matricule = await genererMatricule(role);
    const mdpProvisoire = "MZ" + Math.floor(100000 + Math.random() * 900000);
    const motDePasseHash = await bcrypt.hash(mdpProvisoire, 10);

    // ✅ Insérer utilisateur SANS id_classe
    const resultat = await pool.query(`
      INSERT INTO utilisateurs
        (nom, prenom, email, mot_de_passe, telephone, role, matricule,
         est_actif, date_creation, date_naissance, lieu_naissance, statut_compte)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), $8, $9, 'valide')
      RETURNING id, matricule, nom, prenom, email, role, date_creation
    `, [
      nom.trim(), prenom.trim(), emailNettoye, motDePasseHash,
      telephone || null, role, matricule,
      date_naissance || null, lieu_naissance || null
    ]);

    // ✅ Si ÉLÈVE → aussi dans préinscriptions SANS id_classe
    if (role === 'eleve') {
      const annee = annee_scolaire || '2026-2027';
      await pool.query(`
        INSERT INTO preinscriptions
          (nom, prenoms, date_naissance, lieu_naissance,
           nom_pere, nom_mere, telephone_pere, telephone_mere,
           email, telephone, matricule, statut, annee_scolaire)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'validee', $12)
      `, [
        nom.trim(), prenom.trim(), date_naissance || null, lieu_naissance || null,
        nom_pere || null, nom_mere || null,
        telephone_pere || null, telephone_mere || null,
        emailNettoye, telephone || null, matricule, annee
      ]);

      // 📊 Calcul AUTO moyenne/rang/mention SANS id_classe
      const idNouvelEleve = resultat.rows[0].id;
      const resultats = await calculerResultatsEleve(idNouvelEleve, annee);
      await pool.query(`
        UPDATE preinscriptions
        SET moyenne_annee_precedente = $1, rang_annee_precedente = $2::VARCHAR, mention_annee_precedente = $3
        WHERE matricule = $4
      `, [resultats.moyenne, resultats.rang, resultats.mention, matricule]);
    }

    res.json({
      ok: true,
      message: `✅ ${role} créé avec succès`,
      utilisateur: resultat.rows[0],
      mdp_provisoire: mdpProvisoire
    });
  } catch (e) {
    console.log("❌ ERREUR CRÉATION :", e.code, e.message);
    res.json({ ok: false, erreur: e.message, code: e.code });
  }
});

// ==================================================
// ✏️ MODIFIER UN UTILISATEUR — SANS id_classe
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ ID invalide" });

    const {
      nom, prenom, email, telephone, role,
      date_naissance, lieu_naissance, annee_scolaire
    } = req.body;

    if (!nom || !prenom || !email) return res.json({ ok: false, erreur: "⚠️ Nom, Prénom et Email obligatoires" });

    const emailNettoye = email.trim().toLowerCase();
    const exist = await pool.query(
      'SELECT id FROM utilisateurs WHERE LOWER(email) = $1 AND id != $2',
      [emailNettoye, id]
    );
    if (exist.rows.length) return res.json({ ok: false, erreur: "⚠️ Email déjà utilisé" });

    // Mettre à jour utilisateur SANS id_classe
    await pool.query(`
      UPDATE utilisateurs
      SET nom = $1, prenom = $2, email = $3, telephone = $4,
          role = $5, date_naissance = $6, lieu_naissance = $7
      WHERE id = $8
    `, [
      nom.trim(), prenom.trim(), emailNettoye, telephone || null,
      role, date_naissance || null, lieu_naissance || null, id
    ]);

    // Si élève → MAJ préinscriptions + RECALCUL AUTO SANS id_classe
    if (role === 'eleve') {
      const annee = annee_scolaire || '2026-2027';
      const rPreins = await pool.query(
        'SELECT matricule FROM preinscriptions WHERE id_utilisateur = $1 OR matricule IN (SELECT matricule FROM utilisateurs WHERE id = $1)',
        [id]
      );
      if (rPreins.rows.length > 0) {
        const matricule = rPreins.rows[0].matricule;
        await pool.query(`
          UPDATE preinscriptions
          SET date_naissance = $1, lieu_naissance = $2
          WHERE matricule = $3
        `, [date_naissance || null, lieu_naissance || null, matricule]);

        const resultats = await calculerResultatsEleve(id, annee);
        await pool.query(`
          UPDATE preinscriptions
          SET moyenne_annee_precedente = $1, rang_annee_precedente = $2::VARCHAR, mention_annee_precedente = $3
          WHERE matricule = $4
        `, [resultats.moyenne, resultats.rang, resultats.mention, matricule]);
      }
    }

    res.json({ ok: true, message: "✅ Utilisateur modifié ! Moyenne/Rang/Mention recalculés." });
  } catch (e) {
    console.log("❌ ERREUR MODIFICATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UN UTILISATEUR
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ ID invalide" });

    const r = await pool.query('DELETE FROM utilisateurs WHERE id = $1 RETURNING nom, prenom, role', [id]);
    if (!r.rows.length) return res.json({ ok: false, erreur: "⚠️ Utilisateur introuvable" });

    console.log("✅ Supprimé :", r.rows[0]);
    res.json({ ok: true, message: "✅ Utilisateur supprimé !" });
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION :", e.code, e.message);
    if (e.code === '23503') return res.json({ ok: false, erreur: "⚠️ Impossible : utilisé ailleurs dans le système" });
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📝 INSCRIPTION PUBLIQUE — TOUS RÔLES SANS id_classe
// ==================================================
router.post('/inscription', async (req, res) => {
  try {
    const { nom, prenom, email, telephone, mot_de_passe, role, date_naissance, lieu_naissance, adresse } = req.body;

    // ✅ Validation des champs obligatoires
    if (!nom || !prenom || !email || !mot_de_passe || !role) {
      return res.json({ ok: false, erreur: "⚠️ Nom, Prénom, Email, Mot de passe et Rôle sont obligatoires" });
    }

    // ✅ TOUS les rôles peuvent s'inscrire
    const rolesAutorises = ['admin','professeur','eleve','parent','visiteur','comptable','secretaire','directeur'];
    if (!rolesAutorises.includes(role)) {
      return res.json({ ok: false, erreur: "⚠️ Rôle invalide. Rôles autorisés : " + rolesAutorises.join(', ') });
    }

    // ✅ Email unique
    const emailNettoye = email.trim().toLowerCase();
    const exist = await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [emailNettoye]);
    if (exist.rows.length) return res.json({ ok: false, erreur: "⚠️ Cet email est déjà utilisé" });

    // ✅ Crypter le mot de passe
    const hash = await bcrypt.hash(mot_de_passe, 10);

    // ✅ Générer matricule SANS id_classe
    const matricule = await genererMatricule(role);

    // ✅ Enregistrer — statut "en_attente" SANS id_classe
    const resultat = await pool.query(`
      INSERT INTO utilisateurs(
        nom, prenom, email, telephone, mot_de_passe, role, matricule,
        date_naissance, lieu_naissance, adresse, est_actif, statut_compte
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, 'en_attente')
      RETURNING id, nom, prenom, email, role, matricule, date_creation
    `, [
      nom.trim(), prenom.trim(), emailNettoye, telephone || null, hash, role, matricule,
      date_naissance || null, lieu_naissance || null, adresse || null
    ]);

    // ✅ Si élève → copier aussi dans préinscriptions SANS id_classe
    if (role === 'eleve') {
      await pool.query(`
        INSERT INTO preinscriptions(
          nom, prenoms, email, telephone, date_naissance,
          lieu_naissance, matricule, statut, annee_scolaire
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'en_attente', '2026-2027')
      `, [
        nom.trim(), prenom.trim(), emailNettoye, telephone || null,
        date_naissance || null, lieu_naissance || null, matricule
      ]);
    }

    res.json({
      ok: true,
      message: "✅ Inscription enregistrée ! Votre compte est en attente de validation par l'administrateur.",
      utilisateur: resultat.rows[0]
    });
  } catch (e) {
    console.log("❌ ERREUR INSCRIPTION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✅ VALIDER UNE INSCRIPTION (Admin uniquement)
// ==================================================
router.put('/valider/:id', protegerAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body; // 'valide' ou 'refuse'

    const r = await pool.query(`
      UPDATE utilisateurs
      SET statut_compte = $1, est_actif = $2
      WHERE id = $3
      RETURNING nom, prenom, email, role, statut_compte
    `, [statut || 'valide', statut === 'valide', id]);

    if (!r.rows.length) return res.json({ ok: false, erreur: "⚠️ Utilisateur introuvable" });

    res.json({ ok: true, message: `✅ Compte ${statut === 'valide' ? 'VALIDÉ ✅' : 'REFUSÉ ❌'}`, utilisateur: r.rows[0] });
  } catch (e) {
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;