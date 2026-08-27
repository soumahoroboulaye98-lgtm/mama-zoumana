const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');

// ✅ Protections groupées
const protegerAdminOuProf = [veriftoken];
const protegerAdmin = [veriftoken, verifadmin];

// ==================================================
// 🏷️ Mention, Tableau d'honneur & Appréciation
// ==================================================
function attribuerMentionEtTableau(moyenne) {
  const m = parseFloat(moyenne) || 0;
  let mention = '';
  let tableau_honneur = false;

  if (m >= 18) { mention = '🏆 EXCELLENT'; tableau_honneur = true; }
  else if (m >= 16) { mention = '⭐ TRÈS BIEN'; tableau_honneur = true; }
  else if (m >= 14) { mention = '✅ BIEN'; }
  else if (m >= 12) { mention = '🟡 ASSEZ BIEN'; }
  else if (m >= 10) { mention = '⚠️ PASSABLE'; }
  else { mention = '❌ INSUFFISANT'; }

  let appreciation_generale = '';
  if (m >= 18) appreciation_generale = "Exceptionnel ! Félicitations chaleureuses et encouragements à poursuivre sur cette excellente lancée.";
  else if (m >= 16) appreciation_generale = "Très remarquable. Excellent travail, maintenez les efforts !";
  else if (m >= 14) appreciation_generale = "Très bon niveau. Encouragez vivement la poursuite des efforts.";
  else if (m >= 12) appreciation_generale = "Résultats satisfaisants. Des efforts réguliers permettront de progresser davantage.";
  else if (m >= 10) appreciation_generale = "Moyenne juste. Un effort soutenu et une attention plus grande sont nécessaires.";
  else appreciation_generale = "Résultats insuffisants. Un travail sérieux et assidu s'impose impérativement.";

  return { mention, tableau_honneur, appreciation_generale };
}

// 📊 Calcul moyenne pondérée
async function calculerMoyenneEleve(id_eleve, id_classe, trimestre, annee) {
  const notes = await pool.query(`
    SELECT n.moyenne_matiere, m.coefficient, m.libelle_matiere, n.note1, n.note2, n.note3
    FROM notes n
    JOIN matieres m ON n.id_matiere = m.id_matiere
    WHERE n.id_eleve = $1 AND n.id_classe = $2 
      AND n.trimestre = $3 AND n.annee_scolaire = $4
    ORDER BY m.libelle_matiere
  `, [id_eleve, id_classe, trimestre, annee]);

  let totalPoints = 0, totalCoef = 0;
  notes.rows.forEach(n => {
    const moy = parseFloat(n.moyenne_matiere) || 0;
    const coef = parseFloat(n.coefficient) || 1;
    totalPoints += moy * coef;
    totalCoef += coef;
  });

  const moyenne = totalCoef > 0 
    ? parseFloat((totalPoints / totalCoef).toFixed(2)) 
    : 0;

  return {
    total_points: parseFloat(totalPoints.toFixed(2)),
    total_coef: parseFloat(totalCoef.toFixed(2)),
    moyenne,
    details: notes.rows
  };
}

// ==================================================
// 📊 CALCULER BULLETINS — Classe + Trimestre
// ==================================================
router.post('/calculer', protegerAdminOuProf, async (req, res) => {
  try {
    const { id_classe, trimestre, annee_scolaire, note_conduite } = req.body;
    const annee = annee_scolaire || '2026-2027';
    const noteConduite = note_conduite || null;

    if (!id_classe || !trimestre) {
      return res.json({ ok: false, erreur: "⚠️ Classe et Trimestre obligatoires" });
    }

    // Récupère tous les élèves ayant des notes
    const resultatsEleves = await pool.query(`
      SELECT DISTINCT 
        n.id_eleve, u.nom, u.prenom, u.matricule, u.photo_profil,
        u.qr_code, u.email, u.telephone, c.libelle_classe
      FROM notes n
      JOIN utilisateurs u ON n.id_eleve = u.id
      JOIN classes c ON n.id_classe = c.id_classe
      WHERE n.id_classe = $1 AND n.trimestre = $2 AND n.annee_scolaire = $3
        AND u.role = 'eleve'
      ORDER BY u.nom, u.prenom
    `, [id_classe, trimestre, annee]);

    if (resultatsEleves.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Aucune note trouvée pour cette classe et ce trimestre" });
    }

    // Calcul des moyennes
    const resultatsFinaux = [];
    for (const eleve of resultatsEleves.rows) {
      const { total_points, total_coef, moyenne, details } = 
        await calculerMoyenneEleve(eleve.id_eleve, id_classe, trimestre, annee);

      const { mention, tableau_honneur, appreciation_generale } = attribuerMentionEtTableau(moyenne);

      resultatsFinaux.push({
        id_eleve: eleve.id_eleve,
        nom: eleve.nom,
        prenoms: eleve.prenom,
        matricule: eleve.matricule,
        photo_profil: eleve.photo_profil,
        qr_code: eleve.qr_code,
        email: eleve.email,
        telephone: eleve.telephone,
        libelle_classe: eleve.libelle_classe,
        id_classe,
        trimestre,
        total_points,
        total_coef,
        moyenne,
        mention,
        tableau_honneur,
        appreciation_generale,
        note_conduite: noteConduite,
        details
      });
    }

    // 🏆 Classement
    resultatsFinaux.sort((a, b) => b.moyenne - a.moyenne);
    for (let i = 0; i < resultatsFinaux.length; i++) {
      resultatsFinaux[i].rang = i + 1;
      const el = resultatsFinaux[i];

      // ✅ Requête COMPLÈTE avec TOUTES les colonnes
      await pool.query(`
        INSERT INTO bulletins(
          id_eleve, id_classe, trimestre, annee_scolaire,
          total_points, total_coef, moyenne, rang,
          mention, tableau_honneur, note_conduite,
          appreciation_generale, date_edition
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
        ON CONFLICT (id_eleve, id_classe, trimestre, annee_scolaire) DO UPDATE SET
          total_points = EXCLUDED.total_points,
          total_coef = EXCLUDED.total_coef,
          moyenne = EXCLUDED.moyenne,
          rang = EXCLUDED.rang,
          mention = EXCLUDED.mention,
          tableau_honneur = EXCLUDED.tableau_honneur,
          note_conduite = EXCLUDED.note_conduite,
          appreciation_generale = EXCLUDED.appreciation_generale,
          date_edition = CURRENT_TIMESTAMP
      `, [
        el.id_eleve, el.id_classe, el.trimestre, annee,
        el.total_points, el.total_coef, el.moyenne, el.rang,
        el.mention, el.tableau_honneur, el.note_conduite,
        el.appreciation_generale
      ]);
    }

    console.log(`✅ Bulletins générés — ${resultatsFinaux.length} élève(s)`);
    res.json({ 
      ok: true, 
      effectif: resultatsFinaux.length, 
      classement: resultatsFinaux,
      message: `✅ ${resultatsFinaux.length} bulletin(s) généré(s) !` 
    });
  } catch (e) {
    console.error("❌ ERREUR CALCUL BULLETINS :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 CONSULTER UN BULLETIN
// ==================================================
router.get('/voir/:id_eleve', protegerAdminOuProf, async (req, res) => {
  try {
    const { id_classe, trimestre, annee_scolaire } = req.query;
    const annee = annee_scolaire || '2026-2027';
    const { id_eleve } = req.params;

    if (!id_classe || !trimestre) {
      return res.json({ ok: false, erreur: "⚠️ Classe et Trimestre obligatoires" });
    }

    // Infos élève
    const eleve = await pool.query(`
      SELECT u.nom, u.prenom, u.matricule, u.photo_profil, u.qr_code,
             u.email, u.telephone, c.libelle_classe
      FROM utilisateurs u
      LEFT JOIN classes c ON u.id_classe = c.id_classe
      WHERE u.id = $1 AND u.role = 'eleve'
    `, [id_eleve]);

    if (eleve.rows.length === 0) {
      return res.json({ ok: false, erreur: "⚠️ Élève introuvable" });
    }

    // Relevé de notes
    const notes = await pool.query(`
      SELECT n.note1, n.note2, n.note3, n.moyenne_matiere,
             m.coefficient, m.libelle_matiere
      FROM notes n
      JOIN matieres m ON n.id_matiere = m.id_matiere
      WHERE n.id_eleve = $1 AND n.id_classe = $2
        AND n.trimestre = $3 AND n.annee_scolaire = $4
      ORDER BY m.libelle_matiere
    `, [id_eleve, id_classe, trimestre, annee]);

    // Bulletin complet
    const bulletin = await pool.query(`
      SELECT * FROM bulletins 
      WHERE id_eleve = $1 AND id_classe = $2 AND trimestre = $3 AND annee_scolaire = $4
    `, [id_eleve, id_classe, trimestre, annee]);

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
// ==================================================
router.get('/classement', protegerAdminOuProf, async (req, res) => {
  try {
    const { id_classe, trimestre, annee_scolaire } = req.query;
    const annee = annee_scolaire || '2026-2027';

    if (!id_classe || !trimestre) {
      return res.json({ ok: false, erreur: "⚠️ Classe et Trimestre obligatoires" });
    }

    const resultats = await pool.query(`
      SELECT b.*, u.nom, u.prenom, u.matricule, u.photo_profil, u.qr_code
      FROM bulletins b
      JOIN utilisateurs u ON b.id_eleve = u.id
      WHERE b.id_classe = $1 AND b.trimestre = $2 AND b.annee_scolaire = $3
      ORDER BY b.moyenne DESC
    `, [id_classe, trimestre, annee]);

    res.json({ ok: true, classement: resultats.rows });
  } catch (e) {
    console.error("❌ ERREUR CLASSEMENT :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;