const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');

// ✅ Protections groupées
const protegerAdmin = [veriftoken, verifadmin];
const protegerProf = [veriftoken, verifprof];

// ==================================================
// ✅ Admin : Liste toutes les classes
// ==================================================
router.get('/toutes-classes', protegerAdmin, async (req, res) => {
  try {
    console.log("📦 Admin → Chargement TOUTES les classes");
    const { rows } = await pool.query(`
      SELECT id_classe, libelle_classe
      FROM classes ORDER BY libelle_classe ASC
    `);
    res.json({ ok: true, classes: rows });
  } catch (e) {
    console.error("❌ ERREUR toutes-classes :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✅ Admin : Liste toutes les matières
// ==================================================
router.get('/toutes-matieres', protegerAdmin, async (req, res) => {
  try {
    console.log("📦 Admin → Chargement TOUTES les matières");
    const { rows } = await pool.query(`
      SELECT id_matiere, libelle_matiere, coefficient, volume_horaire, langue_ens
      FROM matieres ORDER BY libelle_matiere ASC
    `);
    res.json({ ok: true, matieres: rows });
  } catch (e) {
    console.error("❌ ERREUR toutes-matieres :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🏫 Prof : Mes classes
// ==================================================
router.get('/mes-classes', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    console.log("🔍 Prof → Chargement classes — id_prof:", id_prof);

    const { rows } = await pool.query(`
      SELECT DISTINCT c.id_classe, c.libelle_classe
      FROM classes c
      JOIN affectations_ens a ON c.id_classe = a.id_classe
      WHERE a.id_prof = $1
      ORDER BY c.libelle_classe ASC
    `, [id_prof]);
    console.log(`✅ Classes trouvées : ${rows.length}`);
    res.json({ ok: true, classes: rows });
  } catch (e) {
    console.error("❌ ERREUR mes-classes :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📚 Prof : Mes matières (filtré par classe si précisé)
// ==================================================
router.get('/mes-matieres', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    const id_classe = req.query.classe ? parseInt(req.query.classe) : null;
    console.log("🔍 Prof → Chargement matières — id_prof:", id_prof, "classe:", id_classe);

    let requete = `
      SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire
      FROM matieres m
      JOIN affectations_ens a ON m.id_matiere = a.id_matiere
      WHERE a.id_prof = $1
    `;
    let parametres = [id_prof];

    if (id_classe && !isNaN(id_classe)) {
      requete += ` AND a.id_classe = $2`;
      parametres.push(id_classe);
    }
    requete += ` ORDER BY m.libelle_matiere ASC`;

    const { rows } = await pool.query(requete, parametres);
    console.log(`✅ Matières trouvées : ${rows.length}`);
    res.json({ ok: true, matieres: rows });
  } catch (e) {
    console.error("❌ ERREUR mes-matieres :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 👥 Élèves d'une classe
// ==================================================
router.get('/eleves-classe/:id_classe', protegerProf, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id_classe);
    if (isNaN(id_classe))
      return res.json({ ok: false, erreur: "⚠️ Identifiant de classe invalide" });

    const { rows } = await pool.query(`
      SELECT u.id AS id_eleve, u.nom, u.prenom, u.matricule, u.photo_profil
      FROM utilisateurs u
      WHERE u.role = 'eleve' AND u.id_classe = $1
      ORDER BY u.nom, u.prenom
    `, [id_classe]);
    console.log(`✅ Élèves de la classe ${id_classe} : ${rows.length}`);
    res.json({ ok: true, eleves: rows });
  } catch (e) {
    console.error("❌ ERREUR ÉLÈVES CLASSE :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ Saisie / modification des notes
// ==================================================
router.post('/saisir', protegerProf, async (req, res) => {
  try {
    const { notes } = req.body;
    const id_prof = req.user.id;

    if (!id_prof)
      return res.json({ ok: false, erreur: "⚠️ Profil introuvable. Reconnectez-vous." });
    if (!notes || !Array.isArray(notes) || notes.length === 0)
      return res.json({ ok: false, erreur: "⚠️ Aucune note à enregistrer" });

    const resultat = [];

    for (const n of notes) {
      const {
        id_eleve, id_classe, id_matiere, trimestre, annee_scolaire,
        note1, note2, note3, note4, note5,
        moyenne_matiere, rang, mention, tableau_honneur, appreciation
      } = n;

      if (!id_eleve || !id_classe || !id_matiere || !trimestre)
        return res.json({ ok: false, erreur: "⚠️ Données élève incomplètes" });

      const annee = annee_scolaire || '2026-2027';
      const nettoyerNote = (v) => (v !== '' && v !== null && !isNaN(Number(v))) ? Number(v) : null;
      const [n1, n2, n3, n4, n5] = [note1, note2, note3, note4, note5].map(nettoyerNote);
      const valeurs = [n1, n2, n3, n4, n5].filter(x => x !== null);

      if (valeurs.some(x => x < 0 || x > 20))
        return res.json({ ok: false, erreur: "⚠️ Les notes doivent être entre 0 et 20" });

      const moyenneCalculee = valeurs.length
        ? Number((valeurs.reduce((a, b) => a + b, 0) / valeurs.length).toFixed(2))
        : null;

      const { rows: [coef] } = await pool.query(
        'SELECT coefficient FROM matieres WHERE id_matiere = $1', [id_matiere]
      );
      const coefficient = coef?.coefficient || 1;

      await pool.query(`
        INSERT INTO notes(
          id_eleve, id_matiere, id_classe, trimestre, annee_scolaire,
          note1, note2, note3, note4, note5,
          moyenne_matiere, coefficient, rang, mention,
          tableau_honneur, appreciation, saisi_par, date_saisie
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)
        ON CONFLICT (id_eleve, id_matiere, id_classe, trimestre, annee_scolaire) DO UPDATE
        SET note1=$6, note2=$7, note3=$8, note4=$9, note5=$10,
            moyenne_matiere=$11, coefficient=$12, rang=$13,
            mention=$14, tableau_honneur=$15, appreciation=$16,
            saisi_par=$17, date_saisie=CURRENT_TIMESTAMP
      `, [
        id_eleve, id_matiere, id_classe, trimestre, annee,
        n1, n2, n3, n4, n5,
        moyenne_matiere || moyenneCalculee, coefficient,
        rang || null, mention || null,
        tableau_honneur || false, appreciation || null, id_prof
      ]);

      resultat.push({ id_eleve, moyenne: moyenne_matiere || moyenneCalculee, mention });
    }

    console.log(`✅ Notes enregistrées : ${notes.length} élève(s)`);
    res.json({ ok: true, message: `✅ ${notes.length} élève(s) enregistré(s) !`, details: resultat });
  } catch (e) {
    console.error("❌ ERREUR SAISIE NOTES :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📋 Charger les notes existantes
// ==================================================
router.post('/consulter', protegerProf, async (req, res) => {
  try {
    const { id_classe, id_matiere, trimestre, annee_scolaire } = req.body;
    const annee = annee_scolaire || '2026-2027';

    if (!id_classe || !id_matiere || !trimestre)
      return res.json({ ok: false, erreur: "⚠️ Paramètres manquants" });

    const { rows } = await pool.query(`
      SELECT n.id_eleve, n.note1, n.note2, n.note3, n.note4, n.note5,
             n.moyenne_matiere, n.rang, n.mention, n.tableau_honneur, n.appreciation,
             u.nom, u.prenom, u.matricule, u.photo_profil,
             m.libelle_matiere, m.coefficient
      FROM notes n
      JOIN utilisateurs u ON n.id_eleve = u.id
      JOIN matieres m ON n.id_matiere = m.id_matiere
      WHERE n.id_classe = $1 AND n.id_matiere = $2
        AND n.trimestre = $3 AND n.annee_scolaire = $4
      ORDER BY u.nom, u.prenom
    `, [id_classe, id_matiere, trimestre, annee]);

    console.log(`✅ Notes chargées — Classe ${id_classe}, Matière ${id_matiere}, Trimestre ${trimestre}`);
    res.json({ ok: true, notes: rows });
  } catch (e) {
    console.error("❌ ERREUR CHARGEMENT NOTES :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📄 Générer bulletins + moyenne générale + classement
// ==================================================
router.post('/generer-bulletin/:id_classe/:trimestre', protegerProf, async (req, res) => {
  try {
    const { id_classe, trimestre } = req.params;
    const annee = '2026-2027';

    await pool.query(`
      WITH moy_eleve AS (
        SELECT n.id_eleve,
               SUM(n.moyenne_matiere * m.coefficient) / NULLIF(SUM(m.coefficient), 0) AS moyenne_generale
        FROM notes n
        JOIN matieres m ON n.id_matiere = m.id_matiere
        WHERE n.id_classe = $1 AND n.trimestre = $2 AND n.annee_scolaire = $3
        GROUP BY n.id_eleve
      )
      INSERT INTO bulletins(id_eleve, id_classe, trimestre, annee_scolaire, moyenne_generale, rang)
      SELECT id_eleve, $1, $2, $3, moyenne_generale,
             ROW_NUMBER() OVER (ORDER BY moyenne_generale DESC) AS rang
      FROM moy_eleve
      ON CONFLICT (id_eleve, id_classe, trimestre, annee_scolaire) DO UPDATE
      SET moyenne_generale = EXCLUDED.moyenne_generale, rang = EXCLUDED.rang
    `, [id_classe, trimestre, annee]);

    console.log(`✅ Bulletins générés — Classe ${id_classe}, Trimestre ${trimestre}`);
    res.json({ ok: true, message: "✅ Bulletins générés avec succès !" });
  } catch (e) {
    console.error("❌ ERREUR GÉNÉRATION BULLETINS :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;