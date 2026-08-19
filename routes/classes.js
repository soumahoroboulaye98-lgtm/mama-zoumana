const express = require('express');
const router = express.Router();
const pool = require('../db');
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');


// ==================================================
// 📚 CLASSES — LISTE POUR PRÉINSCRIPTION (AVEC PLACES)
// ==================================================

router.get('/', async (req, res) => {
  try {
    const requete = `
      SELECT 
        id_classe AS id,
        libelle_classe AS nom,
        libelle_classe_ar,
        libelle_classe_en,
        cycle,
        capacite_max AS capacite_totale,
        places_occupees,
        (capacite_max - places_occupees) AS places_restantes,
        statut
      FROM classes
      WHERE statut = 'ouverte'
      ORDER BY libelle_classe
    `;
    const resultat = await pool.query(requete);
    res.json({ ok: true, classes: resultat.rows });
  } catch (erreur) {
    console.error("❌ ERREUR CLASSES :", erreur.message);
    res.json({ ok: false, erreur: "Impossible de charger les classes" });
  }
});


// ==================================================
// 📚 CLASSES — ADMIN (Gestion complète)
// ==================================================

router.get('/toutes', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT *, (capacite_max - places_occupees) AS places_restantes 
      FROM classes ORDER BY libelle_classe
    `);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) { 
    console.log("❌ ERREUR CLASSE :", e.message);
    res.json({ ok: false, erreur: e.message }); 
  }
});


router.get('/liste', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_classe, libelle_classe, libelle_classe_ar, libelle_classe_en, 
             cycle, capacite_max, statut
      FROM classes ORDER BY libelle_classe
    `);
    res.json({ ok: true, liste: r.rows });
  } catch (e) { 
    console.log("❌ ERREUR CLASSE/LISTE :", e.message);
    res.json({ ok: false, erreur: e.message }); 
  }
});


router.post('/init-classes', verifadmin, async (req, res) => {
  try {
    const classes = [
      [1, 'CP1', 'الصف الأول ابتدائي', 'First Year Primary', 'primaire', 35],
      [2, 'CP2', 'الصف الثاني ابتدائي', 'Second Year Primary', 'primaire', 35],
      [3, 'CE1', 'الصف الثالث ابتدائي', 'Third Year Primary', 'primaire', 35],
      [4, 'CE2', 'الصف الرابع ابتدائي', 'Fourth Year Primary', 'primaire', 35],
      [5, 'CM1', 'الصف الخامس ابتدائي', 'Fifth Year Primary', 'primaire', 35],
      [6, 'CM2', 'الصف السادس ابتدائي', 'Sixth Year Primary', 'primaire', 35],
      [7, '6ème', 'السنة الأولى إعدادي', 'First Year Middle School', 'college', 40],
      [8, '5ème', 'السنة الثانية إعدادي', 'Second Year Middle School', 'college', 40],
      [9, '4ème', 'السنة الثالثة إعدادي', 'Third Year Middle School', 'college', 40],
      [10, '3ème', 'السنة الرابعة إعدادي', 'Fourth Year Middle School', 'college', 40],
      [11, '2nde', 'السنة الأولى ثانوي', 'First Year High School', 'lycee', 45],
      [12, '1ère', 'السنة الثانية ثانوي', 'Second Year High School', 'lycee', 45],
      [13, 'Terminale', 'السنة الثالثة ثانوي', 'Final Year High School', 'lycee', 45],
      [14, 'CP1-A', 'الصف الأول ابتدائي أ', 'CP1-A', 'primaire', 35],
      [15, 'CP2-A', 'الصف الثاني ابتدائي أ', 'CP2-A', 'primaire', 35],
      [16, 'CE1-A', 'الصف الثالث ابتدائي أ', 'CE1-A', 'primaire', 35],
      [17, 'CE2-A', 'الصف الرابع ابتدائي أ', 'CE2-A', 'primaire', 35],
      [18, 'CM1-A', 'الصف الخامس ابتدائي أ', 'CM1-A', 'primaire', 35],
      [19, 'CM2-A', 'الصف السادس ابتدائي أ', 'CM2-A', 'primaire', 35],
      [20, '6ème-A', 'السنة الأولى إعدادي أ', '6ème-A', 'college', 40],
      [21, '5ème-A', 'السنة الثانية إعدادي أ', '5ème-A', 'college', 40],
      [22, '4ème-A', 'السنة الثالثة إعدادي أ', '4ème-A', 'college', 40],
      [23, '3ème-A', 'السنة الرابعة إعدادي أ', '3ème-A', 'college', 40],
      [24, '2nde-A', 'السنة الأولى ثانوي أ', '2nde-A', 'lycee', 45],
      [25, '1ère-A', 'السنة الثانية ثانوي أ', '1ère-A', 'lycee', 45],
      [26, 'Terminale-A', 'السنة الثالثة ثانوي أ', 'Terminale-A', 'lycee', 45],
      [27, 'CP1-B', 'الصف الأول ابتدائي ب', 'CP1-B', 'primaire', 35],
      [28, 'CP2-B', 'الصف الثاني ابتدائي ب', 'CP2-B', 'primaire', 35],
      [29, 'CE1-B', 'الصف الثالث ابتدائي ب', 'CE1-B', 'primaire', 35],
      [30, 'CE2-B', 'الصف الرابع ابتدائي ب', 'CE2-B', 'primaire', 35],
      [31, 'CM1-B', 'الصف الخامس ابتدائي ب', 'CM1-B', 'primaire', 35],
      [32, 'CM2-B', 'الصف السادس ابتدائي ب', 'CM2-B', 'primaire', 35],
      [33, '6ème-B', 'السنة الأولى إعدادي ب', '6ème-B', 'college', 40],
      [34, '5ème-B', 'السنة الثانية إعدادي ب', '5ème-B', 'college', 40],
      [35, '4ème-B', 'السنة الثالثة إعدادي ب', '4ème-B', 'college', 40],
      [36, '3ème-B', 'السنة الرابعة إعدادي ب', '3ème-B', 'college', 40],
      [37, '2nde-B', 'السنة الأولى ثانوي ب', '2nde-B', 'lycee', 45],
      [38, '1ère-B', 'السنة الثانية ثانوي ب', '1ère-B', 'lycee', 45],
      [39, 'Terminale-B', 'السنة الثالثة ثانوي ب', 'Terminale-B', 'lycee', 45],
      [40, 'Maternelle', 'التمهيدي', 'Kindergarten', 'maternelle', 30]
    ];

    let inseres = 0;
    for (const [id, libelle, libelle_ar, libelle_en, cycle, capacite] of classes) {
      const exist = await pool.query('SELECT id_classe FROM classes WHERE id_classe = $1', [id]);
      if (exist.rows.length === 0) {
        await pool.query(`
          INSERT INTO classes(id_classe, libelle_classe, libelle_classe_ar, libelle_classe_en, 
            cycle, capacite_max, places_occupees, statut)
          VALUES ($1, $2, $3, $4, $5, $6, 0, 'ouverte')
          ON CONFLICT (id_classe) DO NOTHING
        `, [id, libelle, libelle_ar, libelle_en, cycle, capacite]);
        inseres++;
      }
    }

    res.json({ ok: true, message: `✅ ${inseres} classes créées !`, creees: inseres });
  } catch (e) { 
    console.log("❌ ERREUR INIT CLASSES :", e.message);
    res.json({ ok: false, erreur: e.message }); 
  }
});


router.post('/', verifadmin, async (req, res) => {
  try {
    const { libelle_classe, cycle, capacite_max, salle, statut } = req.body;

    if (!libelle_classe || libelle_classe.trim() === '') {
      return res.json({ ok: false, erreur: "⚠️ Indiquez le nom de la classe !" });
    }
    if (!cycle || !['maternelle','primaire','college','lycee','superieur'].includes(cycle)) {
      return res.json({ ok: false, erreur: "⚠️ Cycle invalide ! Valeurs : maternelle, primaire, college, lycee, superieur" });
    }
    if (!statut || !['ouverte','complete','fermee'].includes(statut)) {
      return res.json({ ok: false, erreur: "⚠️ Statut invalide ! Valeurs : ouverte, complete, fermee" });
    }

    const cap = Number(capacite_max);
    if (isNaN(cap) || cap < 10 || cap > 80) {
      return res.json({ ok: false, erreur: "⚠️ Capacité doit être entre 10 et 80 !" });
    }

    const maxId = await pool.query('SELECT COALESCE(MAX(id_classe), 0) + 1 AS prochain FROM classes');
    const prochainId = maxId.rows[0].prochain;

    await pool.query(`
      INSERT INTO classes(id_classe, libelle_classe, cycle, capacite_max, places_occupees, salle, statut)
      VALUES ($1, $2, $3, $4, 0, $5, $6)
    `, [prochainId, libelle_classe.trim(), cycle, cap, salle || null, statut || 'ouverte']);

    res.json({ ok: true, message: "✅ Classe enregistrée !", id_classe: prochainId });
  } catch (e) { 
    console.log("❌ ERREUR CLASSE :", e.code, "|", e.message);
    if (e.code === '23514') {
      return res.json({ ok: false, erreur: "⚠️ Capacité doit être entre 10 et 80 !" });
    }
    res.json({ ok: false, erreur: e.message }); 
  }
});


router.put('/:id', verifadmin, async (req, res) => {
  try {
    const { libelle_classe, cycle, capacite_max, salle, statut } = req.body;

    if (!libelle_classe || libelle_classe.trim() === '') {
      return res.json({ ok: false, erreur: "⚠️ Indiquez le nom de la classe !" });
    }
    const cap = Number(capacite_max);
    if (isNaN(cap) || cap < 10 || cap > 80) {
      return res.json({ ok: false, erreur: "⚠️ Capacité doit être entre 10 et 80 !" });
    }

    const r = await pool.query(`
      UPDATE classes 
      SET libelle_classe = $1, cycle = $2, capacite_max = $3, salle = $4, statut = $5
      WHERE id_classe = $6
      RETURNING id_classe
    `, [libelle_classe.trim(), cycle, cap, salle || null, statut || 'ouverte', req.params.id]);

    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "Classe introuvable" });
    }
    res.json({ ok: true, message: "✅ Classe mise à jour !" });
  } catch (e) { 
    console.log("❌ ERREUR MODIFICATION CLASSE :", e.message);
    if (e.code === '23514') {
      return res.json({ ok: false, erreur: "⚠️ Capacité doit être entre 10 et 80 !" });
    }
    res.json({ ok: false, erreur: e.message }); 
  }
});


router.delete('/:id', verifadmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM classes WHERE id_classe = $1 RETURNING id_classe', [req.params.id]);
    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "Classe introuvable" });
    }
    res.json({ ok: true, message: "✅ Classe supprimée !" });
  } catch (e) { 
    console.log("❌ ERREUR SUPPRESSION CLASSE :", e.message);
    if (e.code === '23503') {
      return res.json({ ok: false, erreur: "⚠️ Impossible : classe utilisée dans des inscriptions" });
    }
    res.json({ ok: false, erreur: e.message }); 
  }
});


// ==================================================
// 📖 MATIÈRES
// ==================================================

router.get('/matieres', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id_matiere, libelle_matiere, coefficient, volume_horaire, langue_ens
      FROM matieres ORDER BY libelle_matiere
    `);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) { 
    console.log("❌ ERREUR MATIÈRE :", e.message);
    res.json({ ok: false, erreur: e.message }); 
  }
});


router.post('/matieres', verifadmin, async (req, res) => {
  try {
    const { libelle_matiere, coefficient, volume_horaire, langue_ens } = req.body;

    if (!libelle_matiere || libelle_matiere.trim() === '') {
      return res.json({ ok: false, erreur: "⚠️ Indiquez le nom de la matière !" });
    }
    const coef = Number(coefficient) || 1;
    if (coef <= 0) {
      return res.json({ ok: false, erreur: "⚠️ Le coefficient doit être supérieur à 0 !" });
    }

    const vol = Number(volume_horaire) || 0;
    const langue = langue_ens || 'fr';

    await pool.query(`
      INSERT INTO matieres(libelle_matiere, coefficient, volume_horaire, langue_ens)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (libelle_matiere) DO UPDATE SET
        coefficient = EXCLUDED.coefficient,
        volume_horaire = EXCLUDED.volume_horaire,
        langue_ens = EXCLUDED.langue_ens
    `, [libelle_matiere.trim(), coef, vol, langue]);

    res.json({ ok: true, message: "✅ Matière enregistrée !" });
  } catch (e) { 
    console.log("❌ ERREUR MATIÈRE :", e.message);
    res.json({ ok: false, erreur: e.message }); 
  }
});


router.put('/matieres/:id', verifadmin, async (req, res) => {
  try {
    const { libelle_matiere, coefficient, volume_horaire, langue_ens } = req.body;
    const coef = Number(coefficient) || 1;
    const vol = Number(volume_horaire) || 0;
    const langue = langue_ens || 'fr';

    const r = await pool.query(`
      UPDATE matieres 
      SET libelle_matiere = $1, coefficient = $2, volume_horaire = $3, langue_ens = $4
      WHERE id_matiere = $5
      RETURNING id_matiere
    `, [libelle_matiere.trim(), coef, vol, langue, req.params.id]);

    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "Matière introuvable" });
    }
    res.json({ ok: true, message: "✅ Matière mise à jour !" });
  } catch (e) { 
    console.log("❌ ERREUR MODIFICATION MATIÈRE :", e.message);
    res.json({ ok: false, erreur: e.message }); 
  }
});


router.delete('/matieres/:id', verifadmin, async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM matieres WHERE id_matiere = $1 RETURNING id_matiere', [req.params.id]);
    if (r.rowCount === 0) {
      return res.json({ ok: false, erreur: "Matière introuvable" });
    }
    res.json({ ok: true, message: "✅ Matière supprimée !" });
  } catch (e) { 
    console.log("❌ ERREUR SUPPRESSION MATIÈRE :", e.message);
    if (e.code === '23503') {
      return res.json({ ok: false, erreur: "⚠️ Impossible : matière utilisée dans des notes ou affectations" });
    }
    res.json({ ok: false, erreur: e.message }); 
  }
});


// ==================================================
// 🧑‍🏫 AFFECTATIONS ENSEIGNANTS
// ==================================================

router.get('/affectations', verifadmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT a.*, 
             u.nom || ' ' || u.prenoms AS nom_prof,
             c.libelle_classe,
             m.libelle_matiere
      FROM affectations_ens a
      JOIN utilisateurs u ON a.id_prof = u.id_utilisateur
      JOIN classes c ON a.id_classe = c.id_classe
      LEFT JOIN matieres m ON a.id_matiere = m.id_matiere
      ORDER BY u.nom, c.libelle_classe
    `);
    res.json({ ok: true, lignes: r.rows });
  } catch (e) { 
    console.log("❌ ERREUR AFFECTATION :", e.message);
    res.json({ ok: false, erreur: e.message }); 
  }
});


router.post('/affectations', verifadmin, async (req, res) => {
  try {
    const { id_prof, id_classe, id_matiere, annee_scolaire } = req.body;

    if (!id_prof || !id_classe || !id_matiere) {
      return res.json({ ok: false, erreur: "⚠️ Remplis tous les champs !" });
    }

    await pool.query(`
      INSERT INTO affectations_ens(id_prof, id_classe, id_matiere, annee_scolaire)
      VALUES ($1, $2, $3, $4)
    `, [id_prof, id_classe, id_matiere, annee_scolaire || '2026-2027']);
    
    res.json({ ok: true, message: "✅ Affectation enregistrée !" });
  } catch (e) {
    console.log("❌ ERREUR AFFECTATION :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});


router.delete('/affectations/:id', verifadmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM affectations_ens WHERE id_affectation = $1', [req.params.id]);
    res.json({ ok: true, message: "✅ Affectation supprimée !" });
  } catch (e) { 
    console.log("❌ ERREUR SUPPRESSION AFFECTATION :", e.message);
    res.json({ ok: false, erreur: e.message }); 
  }
});


// ==================================================
// 👨‍🏫 MES CLASSES — POUR LE PROFESSEUR CONNECTÉ
// ==================================================

router.get('/prof/classes', verifprof, async (req, res) => {
  try {
    const id_prof = req.user.id_utilisateur;

    const r = await pool.query(`
      SELECT DISTINCT 
        c.id_classe AS id,
        c.libelle_classe AS nom,
        c.libelle_classe_ar,
        c.libelle_classe_en,
        c.cycle,
        c.capacite_max AS capacite_totale,
        (c.capacite_max - c.places_occupees) AS places_restantes
      FROM affectations_ens a
      JOIN classes c ON a.id_classe = c.id_classe
      WHERE a.id_prof = $1
      ORDER BY c.libelle_classe
    `, [id_prof]);

    res.json({
      ok: true,
      classes: r.rows,
      lignes: r.rows
    });

  } catch (e) { 
    console.log("❌ ERREUR MES CLASSES PROF :", e.message);
    res.json({ ok: false, erreur: e.message }); 
  }
});


router.get('/prof/matieres', verifprof, async (req, res) => {
  try {
    const id_prof = req.user.id_utilisateur;

    const r = await pool.query(`
      SELECT DISTINCT 
        m.id_matiere,
        m.libelle_matiere,
        m.coefficient,
        m.volume_horaire,
        m.langue_ens
      FROM affectations_ens a
      JOIN matieres m ON a.id_matiere = m.id_matiere
      WHERE a.id_prof = $1
      ORDER BY m.libelle_matiere
    `, [id_prof]);

    res.json({ ok: true, lignes: r.rows });
  } catch (e) { 
    console.log("❌ ERREUR MES MATIÈRES PROF :", e.message);
    res.json({ ok: false, erreur: e.message }); 
  }
});


module.exports = router;