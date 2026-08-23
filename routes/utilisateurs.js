const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');

// ✅ Protection : d'abord vérifie le token, puis le rôle admin
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 🔧 GÉNÉRER UN MATRICULE AUTOMATIQUEMENT
// ==================================================
async function genererMatricule(role) {
  const prefixes = {
    admin: 'ADM', directeur: 'DIR', comptable: 'CMP',
    prof: 'PRF', eleve: 'ELE', parent: 'PAR', visiteur: 'VIS'
  };
  const pref = prefixes[role] || 'USR';
  const resultat = await pool.query(
    `SELECT COUNT(*) as total FROM utilisateurs WHERE role = $1`,
    [role]
  );
  const nombre = parseInt(resultat.rows[0].total) + 1;
  const numero = String(nombre).padStart(4, '0');
  return `MZ-${pref}-${numero}`;
}

// ==================================================
// 📋 LISTE DES PROFESSEURS
// ==================================================
router.get('/professeurs', protegerAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nom, prenom, email, telephone, matricule
      FROM utilisateurs
      WHERE role = 'prof' AND est_actif = true
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
    let conditions = [];
    let valeurs = [];
    let index = 1;

    if (role) { conditions.push(`role = $${index++}`); valeurs.push(role); }
    if (statut) { conditions.push(`statut_compte = $${index++}`); valeurs.push(statut); }
    if (recherche) {
      conditions.push(`(nom ILIKE $${index} OR prenom ILIKE $${index} OR email ILIKE $${index} OR matricule ILIKE $${index})`);
      valeurs.push(`%${recherche}%`); index++;
    }

    const clause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const r = await pool.query(`
      SELECT id, nom, prenom, email, telephone, role,
             matricule, statut_compte, est_actif, date_creation
      FROM utilisateurs
      ${clause}
      ORDER BY nom, prenom
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
    const r = await pool.query(`SELECT * FROM utilisateurs WHERE id = $1`, [req.params.id]);
    if (r.rows.length === 0) {
      return res.json({ ok: false, erreur: "Utilisateur introuvable" });
    }
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
      moyenne_annee_precedente, classement, mention, note_conduite,
      nom_pere, nom_mere, telephone_pere, telephone_mere
    } = req.body;

    // ✅ Vérifier email unique
    const exist = await pool.query(`SELECT id FROM utilisateurs WHERE email = $1`, [email]);
    if (exist.rows.length > 0) {
      return res.json({ ok: false, erreur: "Cet email est déjà utilisé" });
    }

    // ✅ Générer matricule + mot de passe provisoire
    const matricule = await genererMatricule(role);
    const mdpProvisoire = Math.random().toString(36).slice(2, 10).toUpperCase() + '!2026';
    const motDePasseHash = await bcrypt.hash(mdpProvisoire, 10);

    // ✅ Insérer dans utilisateurs
    const resultat = await pool.query(`
      INSERT INTO utilisateurs
      (nom, prenom, email, mot_de_passe, telephone, role, matricule,
       statut_compte, est_actif, date_creation)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())
      RETURNING id, matricule, nom, prenom, email, role, statut_compte
    `, [nom, prenom, email, motDePasseHash, telephone, role, matricule, statut_compte || 'valide']);

    // ✅ Si ÉLÈVE : aussi dans préinscriptions
    if (role === 'eleve') {
      await pool.query(`
        INSERT INTO preinscriptions
        (nom_famille, prenom, date_naissance, lieu_naissance, id_classe_souhaitee,
         nom_parent, telephone_parent, email_parent, statut,
         moyenne_annee_precedente, classement, mention, note_conduite,
         nom_pere, nom_mere, telephone_pere, telephone_mere, annee_scolaire)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      `, [
        nom, prenom, date_naissance || null, lieu_naissance || null, id_classe_souhaitee || null,
        nom_pere || null, telephone_pere || null, email, statut_compte || 'valide',
        moyenne_annee_precedente || null, classement || null, mention || null, note_conduite || null,
        nom_pere || null, nom_mere || null, telephone_pere || null, telephone_mere || null,
        annee_scolaire || '2025-2026'
      ]);
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
    const {
      nom, prenom, email, telephone, role, statut_compte,
      date_naissance, lieu_naissance, id_classe_souhaitee,
      moyenne_annee_precedente, classement, mention, note_conduite
    } = req.body;

    await pool.query(`
      UPDATE utilisateurs
      SET nom = $1, prenom = $2, email = $3, telephone = $4,
          role = $5, statut_compte = $6
      WHERE id = $7
    `, [nom, prenom, email, telephone, role, statut_compte || 'valide', req.params.id]);

    // ✅ Si élève : mettre aussi à jour préinscriptions
    if (role === 'eleve') {
      await pool.query(`
        UPDATE preinscriptions
        SET date_naissance = $1, lieu_naissance = $2, id_classe_souhaitee = $3,
            moyenne_annee_precedente = $4, classement = $5, mention = $6, note_conduite = $7
        WHERE email_parent = $8
      `, [date_naissance, lieu_naissance, id_classe_souhaitee,
          moyenne_annee_precedente, classement, mention, note_conduite, email]);
    }

    res.json({ ok: true, message: "✅ Utilisateur modifié !" });
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
    await pool.query('DELETE FROM utilisateurs WHERE id = $1', [req.params.id]);
    res.json({ ok: true, message: "✅ Utilisateur supprimé !" });
  } catch (e) {
    console.log("❌ ERREUR SUPPRESSION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;