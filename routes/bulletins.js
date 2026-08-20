const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');   // ✅ Ajouté systématiquement
const verifadmin = require('../middleware/verifadmin');   // ✅ Administrateur seul
const verifprof = require('../middleware/verifprof');     // ✅ Professeur seul

// ✅ Protections groupées uniformes
const protegerAdminOuProf = [veriftoken, verifprof];


// ==================================================
// 🏷️ FONCTIONS UTILITAIRES
// ==================================================

// Attribution de la mention, tableau d'honneur et appréciation
function attribuerMentionEtTableau(moyenne) {
  const m = parseFloat(moyenne) || 0;
  let mention = '';
  let tableauHonneur = false;

  if (m >= 18) {
    mention = '🏆 EXCELLENT';
    tableauHonneur = true;
  } else if (m >= 16) {
    mention = '⭐ TRÈS BIEN';
    tableauHonneur = true;
  } else if (m >= 14) {
    mention = '✅ BIEN';
  } else if (m >= 12) {
    mention = '🟡 ASSEZ BIEN';
  } else if (m >= 10) {
    mention = '⚠️ PASSABLE';
  } else {
    mention = '❌ INSUFFISANT';
  }

  const appreciation = genererAppreciation(m);
  return { mention, tableauHonneur, appreciation };
}

// Génération de l'appréciation
function genererAppreciation(m) {
  if (m >= 18) return "Exceptionnel ! Félicitations chaleureuses et encouragements à poursuivre sur cette excellente lancée.";
  if (m >= 16) return "Très remarquable. Excellent travail, maintenez les efforts !";
  if (m >= 14) return "Très bon niveau. Encouragez vivement la poursuite des efforts.";
  if (m >= 12) return "Résultats satisfaisants. Des efforts réguliers permettront de progresser davantage.";
  if (m >= 10) return "Moyenne juste. Un effort soutenu et une attention plus grande sont nécessaires.";
  return "Résultats insuffisants. Un travail sérieux et assidu s'impose impérativement.";
}

// Calcul de la moyenne pondérée pour un élève
async function calculerMoyenneEleve(id_eleve, id_classe, trimestre, annee) {
  const notes = await pool.query(`
    SELECT n.moyenne_matiere, m.coefficient, m.libelle_matiere, n.note1, n.note2, n.note3
    FROM notes n
    JOIN matieres m ON n.id_matiere = m.id_matiere
    WHERE n.id_eleve = $1 AND n.id_classe = $2 
      AND n.trimestre = $3 AND n.annee_scolaire = $4
    ORDER BY m.libelle_matiere
  `, [id_eleve, id_classe, trimestre, annee]);

  let totalPoints = 0;
  let totalCoef = 0;
  notes.rows.forEach(n => {
    const moy = parseFloat(n.moyenne_matiere) || 0;
    const coef = parseFloat(n.coefficient) || 1;
    totalPoints += moy * coef;
    totalCoef += coef;
  });

  const moyenneGenerale = totalCoef > 0 
    ? parseFloat((totalPoints / totalCoef).toFixed(2)) 
    : 0;

  return {
    total_points: parseFloat(totalPoints.toFixed(2)),
    total_coef: totalCoef,
    moyenne_generale: moyenneGenerale,
    details: notes.rows
  };
}


// ==================================================
// 📊 CALCULER BULLETINS, MOYENNES, CLASSEMENT
// ✅ ADMIN ou PROFESSEUR autorisé
// ==================================================
router.post('/calculer', protegerAdminOuProf, async (req, res) => {
  try {
    const { id_classe, trimestre, annee_scolaire } = req.body;
    const annee = annee_scolaire || '2026-2027';

    if (!id_classe || !trimestre) {
      return res.json({ ok: false, erreur: "⚠️ Classe et Trimestre sont obligatoires" });
    }

    // ✅ Récupérer les élèves depuis utilisateurs
    const resultatsEleves = await pool.query(`
      SELECT DISTINCT 
        n.id_eleve,
        u.nom,
        u.prenoms,
        u.matricule,
        u.photo_profil,
        u.qr_code,
        u.email,
        u.telephone,
        c.libelle_classe
      FROM notes n
      JOIN utilisateurs u ON n.id_eleve = u.id_utilisateur
      JOIN classes c ON n.id_classe = c.id_classe
      WHERE n.id_classe = $1 AND n.trimestre = $2 AND n.annee_scolaire = $3
        AND u.role = 'eleve'
      ORDER BY u.nom, u.prenoms
    `, [id_classe, trimestre, annee]);

    if (resultatsEleves.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Aucune note trouvée pour cette classe / ce trimestre" });
    }

    // ✅ Calculer pour chaque élève
    const resultatsFinaux = [];
    for (const eleve of resultatsEleves.rows) {
      const { total_points, total_coef, moyenne_generale, details } = 
        await calculerMoyenneEleve(eleve.id_eleve, id_classe, trimestre, annee);

      const { mention, tableauHonneur, appreciation } = 
        attribuerMentionEtTableau(moyenne_generale);

      resultatsFinaux.push({
        id_eleve: eleve.id_eleve,
        nom: eleve.nom,
        prenoms: eleve.prenoms,
        matricule: eleve.matricule,
        photo_profil: eleve.photo_profil,
        qr_code: eleve.qr_code,
        email: eleve.email,
        telephone: eleve.telephone,
        libelle_classe: eleve.libelle_classe,
        total_points,
        total_coef,
        moyenne_generale,
        mention,
        tableau_honneur: tableauHonneur,
        appreciation,
        details
      });
    }

    // ✅ Classer par moyenne décroissante
    resultatsFinaux.sort((a, b) => b.moyenne_generale - a.moyenne_generale);

    // ✅ Attribuer le rang et enregistrer dans bulletins
    for (let i = 0; i < resultatsFinaux.length; i++) {
      const rang = i + 1;
      const el = resultatsFinaux[i];
      el.rang = rang;

      await pool.query(`
        INSERT INTO bulletins(
          id_eleve, id_classe, trimestre, annee_scolaire, 
          total_points, total_coef, moyenne_generale, rang, 
          mention, tableau_honneur, appreciation, date_generation
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
        ON CONFLICT (id_eleve, id_classe, trimestre, annee_scolaire) DO UPDATE SET
          total_points = EXCLUDED.total_points,
          total_coef = EXCLUDED.total_coef,
          moyenne_generale = EXCLUDED.moyenne_generale,
          rang = EXCLUDED.rang,
          mention = EXCLUDED.mention,
          tableau_honneur = EXCLUDED.tableau_honneur,
          appreciation = EXCLUDED.appreciation,
          date_generation = CURRENT_TIMESTAMP
      `, [
        el.id_eleve, id_classe, trimestre, annee,
        el.total_points, el.total_coef, el.moyenne_generale, rang,
        el.mention, el.tableau_honneur, el.appreciation
      ]);
    }

    console.log(`✅ Calcul bulletins terminé — Classe ${id_classe}, Trimestre ${trimestre}, ${resultatsFinaux.length} élève(s)`);
    res.json({ 
      ok: true, 
      effectif: resultatsFinaux.length,
      classement: resultatsFinaux,
      message: `✅ ${resultatsFinaux.length} bulletin(s) calculé(s) et classé(s) !`
    });

  } catch (e) {
    console.error("❌ ERREUR CALCUL BULLETINS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 📋 VOIR LE BULLETIN D'UN ÉLÈVE
// ✅ ÉLÈVE / PARENT / PROFESSEUR peuvent consulter
// ==================================================
router.get('/voir/:id_eleve', async (req, res) => {
  try {
    const { id_classe, trimestre, annee_scolaire } = req.query;
    const annee = annee_scolaire || '2026-2027';
    const { id_eleve } = req.params;

    if (!id_classe || !trimestre) {
      return res.json({ ok: false, erreur: "⚠️ Classe et Trimestre sont obligatoires" });
    }

    // ✅ Infos élève complètes depuis utilisateurs
    const eleve = await pool.query(`
      SELECT 
        u.nom, u.prenoms, u.matricule, u.photo_profil, u.qr_code,
        u.email, u.telephone,
        c.libelle_classe
      FROM utilisateurs u
      JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.id_utilisateur = $1 AND u.role = 'eleve'
    `, [id_eleve]);

    if (eleve.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Élève introuvable" });
    }

    // ✅ Notes détaillées
    const notes = await pool.query(`
      SELECT n.note1, n.note2, n.note3, n.moyenne_matiere, 
             m.coefficient, m.libelle_matiere
      FROM notes n
      JOIN matieres m ON n.id_matiere = m.id_matiere
      WHERE n.id_eleve = $1 AND n.id_classe = $2 
        AND n.trimestre = $3 AND n.annee_scolaire = $4
      ORDER BY m.libelle_matiere
    `, [id_eleve, id_classe, trimestre, annee]);

    // ✅ Bulletin enregistré
    const bulletin = await pool.query(`
      SELECT * FROM bulletins 
      WHERE id_eleve = $1 AND id_classe = $2 
        AND trimestre = $3 AND annee_scolaire = $4
    `, [id_eleve, id_classe, trimestre, annee]);

    console.log(`✅ Consultation bulletin — Élève ${id_eleve}, T${trimestre} ${annee}`);
    res.json({ 
      ok: true, 
      eleve: eleve.rows[0],
      notes: notes.rows,
      bulletin: bulletin.rows[0] || null
    });

  } catch (e) {
    console.error("❌ ERREUR CONSULTATION BULLETIN :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


// ==================================================
// 🏆 CLASSEMENT DE LA CLASSE
// ✅ ADMIN / PROFESSEUR autorisé
// ==================================================
router.get('/classement', protegerAdminOuProf, async (req, res) => {
  try {
    const { id_classe, trimestre, annee_scolaire } = req.query;
    const annee = annee_scolaire || '2026-2027';

    if (!id_classe || !trimestre) {
      return res.json({ ok: false, erreur: "⚠️ Classe et Trimestre sont obligatoires" });
    }

    const r = await pool.query(`
      SELECT 
        b.*,
        u.nom, u.prenoms, u.matricule, u.photo_profil, u.qr_code
      FROM bulletins b
      JOIN utilisateurs u ON b.id_eleve = u.id_utilisateur
      WHERE b.id_classe = $1 AND b.trimestre = $2 AND b.annee_scolaire = $3
      ORDER BY b.moyenne_generale DESC
    `, [id_classe, trimestre, annee]);

    console.log(`✅ Consultation classement — Classe ${id_classe}, Trimestre ${trimestre}, ${r.rows.length} élève(s)`);
    res.json({ ok: true, classement: r.rows });

  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT CLASSEMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


module.exports = router;