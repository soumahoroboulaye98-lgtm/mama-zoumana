const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection uniforme
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 🔧 GÉNÉRER UN MATRICULE — Format harmonisé MZ-AAAA-PREFIX-NNNN
// ==================================================
async function genererMatricule(role, id_classe = null) {
  const annee = new Date().getFullYear();
  const prefixes = {
    admin: 'ADM', directeur: 'DIR', comptable: 'CMP',
    prof: 'PRF', eleve: 'ELE', parent: 'PAR', visiteur: 'VIS'
  };
  const pref = prefixes[role] || 'USR';

  // Pour élève : inclure le code classe
  if (role === 'eleve' && id_classe) {
    try {
      const rClasse = await pool.query(
        'SELECT libelle_classe FROM classes WHERE id_classe = $1', [id_classe]
      );
      if (rClasse.rows.length > 0) {
        const codeClasse = rClasse.rows[0].libelle_classe
          .toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 4);
        const compte = await pool.query(
          "SELECT COUNT(*) FROM utilisateurs WHERE matricule LIKE $1",
          [`MZ-${annee}-${codeClasse}-%`]
        );
        const num = String(parseInt(compte.rows[0].count) + 1).padStart(4, '0');
        return `MZ-${annee}-${codeClasse}-${num}`;
      }
    } catch {}
  }

  const compte = await pool.query(
    "SELECT COUNT(*) FROM utilisateurs WHERE matricule LIKE $1",
    [`MZ-${annee}-${pref}-%`]
  );
  const num = String(parseInt(compte.rows[0].count) + 1).padStart(4, '0');
  return `MZ-${annee}-${pref}-${num}`;
}

// ==================================================
// 📊 CALCUL MOYENNE / RANG / MENTION — ÉLÈVE (AUTOMATIQUE)
// ==================================================
async function calculerResultatsEleve(id_eleve, id_classe, anneeScolaire) {
  try {
    // Récupérer TOUTES les notes de l'élève
    const notes = await pool.query(`
      SELECT n.valeur, m.coefficient
      FROM notes n
      JOIN matieres m ON n.id_matiere = m.id_matiere
      WHERE n.id_eleve = $1 AND n.annee_scolaire = $2
    `, [id_eleve, anneeScolaire]);

    if (notes.rows.length === 0) {
      return { moyenne: null, rang: null, mention: 'Sans note' };
    }

    // ✅ Calcul MOYENNE pondérée
    let totalPoints = 0, totalCoef = 0;
    notes.rows.forEach(n => {
      totalPoints += (parseFloat(n.valeur) || 0) * parseFloat(n.coefficient || 1);
      totalCoef += parseFloat(n.coefficient || 1);
    });
    const moyenne = totalCoef > 0 ? Math.round((totalPoints / totalCoef) * 100) / 100 : null;

    // ✅ Calcul RANG dans la classe
    const tousEleves = await pool.query(`
      SELECT DISTINCT n.id_eleve
      FROM notes n
      WHERE n.id_classe = $1 AND n.annee_scolaire = $2
    `, [id_classe, anneeScolaire]);

    const moyennesClasse = [];
    for (const e of tousEleves.rows) {
      const eNotes = await pool.query(`
        SELECT n.valeur, m.coefficient
        FROM notes n JOIN matieres m ON n.id_matiere = m.id_matiere
        WHERE n.id_eleve = $1 AND n.id_classe = $2 AND n.annee_scolaire = $3
      `, [e.id_eleve, id_classe, anneeScolaire]);
      let pts = 0, cf = 0;
      eNotes.rows.forEach(n => { pts += (parseFloat(n.valeur) || 0) * parseFloat(n.coefficient || 1); cf += parseFloat(n.coefficient || 1); });
      const m = cf > 0 ? Math.round((pts / cf) * 100) / 100 : 0;
      moyennesClasse.push({ id_eleve: e.id_eleve, moyenne: m });
    }
    moyennesClasse.sort((a, b) => b.moyenne - a.moyenne);
    const rang = moyennesClasse.findIndex(x => x.id_eleve === id_eleve) + 1;

    // ✅ MENTION automatique
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
      WHERE role = 'prof' AND COALESCE(est_actif, true) = true
      ORDER BY nom, prenom
    `);
    res.json({ ok: true, utilisateurs: r.rows });
  } catch (e) {
    console.log("❌ ERREUR LISTE PROFS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 LISTE TOUS LES UTILISATEURS (avec filtres)
// ==================================================
router.get('/', protegerAdmin, async (req, res) => {
  try {
    const { role, statut, recherche } = req.query;
    let conditions = [], valeurs = [], idx = 1;

    if (role) { conditions.push(`role = $${idx++}`); valeurs.push(role); }
    if (statut) { conditions.push(`statut_compte = $${idx++}`); valeurs.push(statut); }
    if (recherche) {
      conditions.push(`(nom ILIKE $${idx} OR prenom ILIKE $${idx} OR email ILIKE $${idx} OR matricule ILIKE $${idx})`);
      valeurs.push(`%${recherche}%`); idx++;
    }

    const clause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const r = await pool.query(`
      SELECT id, nom, prenom, email, telephone, role,
             matricule, statut_compte, COALESCE(est_actif, true) AS est_actif, date_creation
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
// ➕ CRÉER UN UTILISATEUR PAR L'ADMIN
// ==================================================
router.post('/creer-admin', protegerAdmin, async (req, res) => {
  try {
    const {
      nom, prenom, email, telephone, role, statut_compte, annee_scolaire,
      date_naissance, lieu_naissance, id_classe_souhaitee,
      nom_pere, nom_mere, telephone_pere, telephone_mere
    } = req.body;

    if (!nom || !prenom || !email || !role) {
      return res.json({ ok: false, erreur: "⚠️ Nom, Prénom, Email et Profil sont obligatoires" });
    }

    // Email unique
    const exist = await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (exist.rows.length) return res.json({ ok: false, erreur: "⚠️ Cet email existe déjà" });

    // Générer matricule + MDP
    const matricule = await genererMatricule(role, id_classe_souhaitee || null);
    const mdpProvisoire = "MZ" + Math.floor(100000 + Math.random() * 900000);
    const motDePasseHash = await bcrypt.hash(mdpProvisoire, 10);

    // ✅ Créer utilisateur
    const resultat = await pool.query(`
      INSERT INTO utilisateurs
        (nom, prenom, email, mot_de_passe, telephone, role, matricule,
         statut_compte, est_actif, date_creation, id_classe)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), $9)
      RETURNING id, matricule, nom, prenom, email, role, statut_compte
    `, [
      nom.trim(), prenom.trim(), email.trim().toLowerCase(), motDePasseHash,
      telephone || null, role, matricule, statut_compte || 'valide',
      id_classe_souhaitee || null
    ]);

    // ✅ Si ÉLÈVE → aussi dans préinscriptions + calcul AUTO moyenne/rang/mention
    if (role === 'eleve') {
      const annee = annee_scolaire || '2026-2027';
      await pool.query(`
        INSERT INTO preinscriptions
          (nom, prenoms, date_naissance, lieu_naissance, id_classe_souhaitee,
           nom_parent, telephone_parent, email_parent, statut,
           nom_pere, nom_mere, telephone_pere, telephone_mere, annee_scolaire, matricule)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'validee', $9, $10, $11, $12, $13, $14)
      `, [
        nom.trim(), prenom.trim(), date_naissance || null, lieu_naissance || null,
        id_classe_souhaitee || null, nom_pere || null,
        telephone_pere || null, email.trim().toLowerCase(),
        nom_pere || null, nom_mere || null, telephone_pere || null,
        telephone_mere || null, annee, matricule
      ]);

      // 📊 Calcul AUTO des résultats (si notes existent)
      const idNouvelEleve = resultat.rows[0].id;
      const resultats = await calculerResultatsEleve(idNouvelEleve, id_classe_souhaitee, annee);

      // ✅ Mettre à jour préinscription avec valeurs calculées
      await pool.query(`
        UPDATE preinscriptions
        SET moyenne_annee_precedente = $1, classement = $2, mention = $3
        WHERE matricule = $4
      `, [resultats.moyenne, resultats.rang, resultats.mention, matricule]);
    }

    res.json({
      ok: true,
      utilisateur: resultat.rows[0],
      mdp_provisoire: mdpProvisoire
    });
  } catch (e) {
    console.log("❌ ERREUR CRÉATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER UN UTILISATEUR
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.json({ ok: false, erreur: "⚠️ ID invalide" });

    const {
      nom, prenom, email, telephone, role, statut_compte,
      date_naissance, lieu_naissance, id_classe_souhaitee, annee_scolaire
    } = req.body;

    if (!nom || !prenom || !email) return res.json({ ok: false, erreur: "⚠️ Nom, Prénom et Email obligatoires" });

    const emailNettoye = email.trim().toLowerCase();
    const exist = await pool.query(
      'SELECT id FROM utilisateurs WHERE LOWER(email) = $1 AND id != $2',
      [emailNettoye, id]
    );
    if (exist.rows.length) return res.json({ ok: false, erreur: "⚠️ Email déjà utilisé" });

    // Mettre à jour utilisateurs
    await pool.query(`
      UPDATE utilisateurs
      SET nom = $1, prenom = $2, email = $3, telephone = $4,
          role = $5, statut_compte = $6, id_classe = $7
      WHERE id = $8
    `, [nom.trim(), prenom.trim(), emailNettoye, telephone || null,
        role, statut_compte || 'valide', id_classe_souhaitee || null, id]);

    // Si élève → MAJ préinscriptions + RECALCUL AUTO
    if (role === 'eleve') {
      const annee = annee_scolaire || '2026-2027';
      await pool.query(`
        UPDATE preinscriptions
        SET date_naissance = $1, lieu_naissance = $2, id_classe_souhaitee = $3
        WHERE LOWER(email_parent) = $4
      `, [date_naissance || null, lieu_naissance || null, id_classe_souhaitee || null, emailNettoye]);

      // 📊 Recalculer AUTO
      const resultats = await calculerResultatsEleve(id, id_classe_souhaitee, annee);
      await pool.query(`
        UPDATE preinscriptions
        SET moyenne_annee_precedente = $1, classement = $2, mention = $3
        WHERE LOWER(email_parent) = $4
      `, [resultats.moyenne, resultats.rang, resultats.mention, emailNettoye]);
    }

    res.json({ ok: true, message: "✅ Utilisateur modifié ! Moyenne/Rang/Mention recalculés automatiquement." });
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
    console.log("❌ ERREUR SUPPRESSION :", e.message);
    if (e.code === '23503') return res.json({ ok: false, erreur: "⚠️ Impossible : référencé ailleurs" });
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;