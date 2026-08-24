const express = require('express');
const router = express.Router();
const pool = require('../db');
const veriftoken = require('../middleware/veriftoken');
const verifadmin = require('../middleware/verifadmin');
const verifprof = require('../middleware/verifprof');

// ✅ Protections groupées uniformes
const protegerAdmin = [veriftoken, verifadmin];
const protegerProf = [veriftoken, verifprof];

// ==================================================
// 📚 LISTE DES CLASSES OUVERTES (Publique — Préinscription)
// ==================================================
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        id_classe AS id,
        libelle_classe AS nom,
        libelle_classe_ar,
        libelle_classe_en,
        cycle,
        capacite_max,
        places_occupees,
        (capacite_max - places_occupees) AS places_restantes,
        statut
      FROM classes
      WHERE statut = 'ouverte'
      ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Classes ouvertes chargées — ${rows.length} classe(s)`);
    res.json({ ok: true, classes: rows });
  } catch (e) {
    console.error("❌ ERREUR /classes :", e.code, e.message);
    res.json({ ok: false, erreur: "⚠️ Impossible de charger les classes" });
  }
});

// ==================================================
// 📚 TOUTES LES CLASSES (Admin)
// ==================================================
router.get('/toutes', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_classe AS id, libelle_classe AS nom,
             libelle_classe_ar, libelle_classe_en, cycle,
             capacite_max, places_occupees,
             (capacite_max - places_occupees) AS places_restantes,
             salle, statut
      FROM classes ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Toutes classes chargées — ${rows.length}`);
    res.json({ ok: true, classes: rows });
  } catch (e) {
    console.error("❌ ERREUR /toutes :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📚 LISTE SIMPLIFIÉE (Admin)
// ==================================================
router.get('/liste', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_classe, libelle_classe, libelle_classe_ar, libelle_classe_en,
             cycle, capacite_max, statut
      FROM classes ORDER BY libelle_classe ASC
    `);
    console.log(`✅ Liste simplifiée chargée — ${rows.length}`);
    res.json({ ok: true, liste: rows });
  } catch (e) {
    console.error("❌ ERREUR /liste :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📚 INITIALISER CLASSES PAR DÉFAUT (Admin)
// ==================================================
router.post('/init-classes', protegerAdmin, async (req, res) => {
  try {
    const classes = [
      ['CP1','الصف الأول ابتدائي','First Year Primary','primaire',35],
      ['CP2','الصف الثاني ابتدائي','Second Year Primary','primaire',35],
      ['CE1','الصف الثالث ابتدائي','Third Year Primary','primaire',35],
      ['CE2','الصف الرابع ابتدائي','Fourth Year Primary','primaire',35],
      ['CM1','الصف الخامس ابتدائي','Fifth Year Primary','primaire',35],
      ['CM2','الصف السادس ابتدائي','Sixth Year Primary','primaire',35],
      ['6ème','السنة الأولى إعدادي','First Year Middle School','college',40],
      ['5ème','السنة الثانية إعدادي','Second Year Middle School','college',40],
      ['4ème','السنة الثالثة إعدادي','Third Year Middle School','college',40],
      ['3ème','السنة الرابعة إعدادي','Fourth Year Middle School','college',40],
      ['2nde','السنة الأولى ثانوي','First Year High School','lycee',45],
      ['1ère','السنة الثانية ثانوي','Second Year High School','lycee',45],
      ['Terminale','السنة الثالثة ثانوي','Final Year High School','lycee',45],
      ['CP1-A','الصف الأول ابتدائي أ','CP1-A','primaire',35],
      ['CP2-A','الصف الثاني ابتدائي أ','CP2-A','primaire',35],
      ['CE1-A','الصف الثالث ابتدائي أ','CE1-A','primaire',35],
      ['CE2-A','الصف الرابع ابتدائي أ','CE2-A','primaire',35],
      ['CM1-A','الصف الخامس ابتدائي أ','CM1-A','primaire',35],
      ['CM2-A','الصف السادس ابتدائي أ','CM2-A','primaire',35],
      ['6ème-A','السنة الأولى إعدادي أ','6ème-A','college',40],
      ['5ème-A','السنة الثانية إعدادي أ','5ème-A','college',40],
      ['4ème-A','السنة الثالثة إعدادي أ','4ème-A','college',40],
      ['3ème-A','السنة الرابعة إعدادي أ','3ème-A','college',40],
      ['2nde-A','السنة الأولى ثانوي أ','2nde-A','lycee',45],
      ['1ère-A','السنة الثانية ثانوي أ','1ère-A','lycee',45],
      ['Terminale-A','السنة الثالثة ثانوي أ','Terminale-A','lycee',45],
      ['CP1-B','الصف الأول ابتدائي ب','CP1-B','primaire',35],
      ['CP2-B','الصف الثاني ابتدائي ب','CP2-B','primaire',35],
      ['CE1-B','الصف الثالث ابتدائي ب','CE1-B','primaire',35],
      ['CE2-B','الصف الرابع ابتدائي ب','CE2-B','primaire',35],
      ['CM1-B','الصف الخامس ابتدائي ب','CM1-B','primaire',35],
      ['CM2-B','الصف السادس ابتدائي ب','CM2-B','primaire',35],
      ['6ème-B','السنة الأولى إعدادي ب','6ème-B','college',40],
      ['5ème-B','السنة الثانية إعدادي ب','5ème-B','college',40],
      ['4ème-B','السنة الثالثة إعدادي ب','4ème-B','college',40],
      ['3ème-B','السنة الرابعة إعدادي ب','3ème-B','college',40],
      ['2nde-B','السنة الأولى ثانوي ب','2nde-B','lycee',45],
      ['1ère-B','السنة الثانية ثانوي ب','1ère-B','lycee',45],
      ['Terminale-B','السنة الثالثة ثانوي ب','Terminale-B','lycee',45],
      ['Maternelle','التمهيدي','Kindergarten','maternelle',30]
    ];

    let inseres = 0;
    for (const [libelle, ar, en, cycle, cap] of classes) {
      const { rows: [existe] } = await pool.query(
        'SELECT id_classe FROM classes WHERE libelle_classe = $1', [libelle]
      );
      if (!existe) {
        await pool.query(`
          INSERT INTO classes(libelle_classe, libelle_classe_ar, libelle_classe_en,
            cycle, capacite_max, places_occupees, statut)
          VALUES ($1, $2, $3, $4, $5, 0, 'ouverte')
        `, [libelle, ar, en, cycle, cap]);
        inseres++;
      }
    }

    console.log(`✅ ${inseres} classe(s) créée(s)`);
    res.json({ ok: true, message: `✅ ${inseres} classes créées !`, creees: inseres });
  } catch (e) {
    console.error("❌ ERREUR init-classes :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📚 CRÉER UNE CLASSE (Admin)
// ==================================================
router.post('/', protegerAdmin, async (req, res) => {
  try {
    const { libelle_classe, libelle_classe_ar, libelle_classe_en, cycle, capacite_max, salle, statut } = req.body;

    if (!libelle_classe?.trim())
      return res.json({ ok: false, erreur: "⚠️ Indiquez le nom de la classe" });
    if (!['maternelle','primaire','college','lycee','superieur'].includes(cycle))
      return res.json({ ok: false, erreur: "⚠️ Cycle invalide" });
    if (!statut || !['ouverte','complete','fermee'].includes(statut))
      return res.json({ ok: false, erreur: "⚠️ Statut invalide" });

    const cap = Number(capacite_max);
    if (isNaN(cap) || cap < 10 || cap > 80)
      return res.json({ ok: false, erreur: "⚠️ Capacité entre 10 et 80" });

    const { rows: [{ prochain }] } = await pool.query(
      'SELECT COALESCE(MAX(id_classe),0)+1 AS prochain FROM classes'
    );

    await pool.query(`
      INSERT INTO classes(id_classe, libelle_classe, libelle_classe_ar, libelle_classe_en,
        cycle, capacite_max, places_occupees, salle, statut)
      VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)
    `, [prochain, libelle_classe.trim(), libelle_classe_ar || null, libelle_classe_en || null, cycle, cap, salle || null, statut]);

    console.log(`✅ Classe créée — ${libelle_classe} (ID: ${prochain})`);
    res.json({ ok: true, message: "✅ Classe créée", id_classe: prochain });
  } catch (e) {
    console.error("❌ ERREUR création classe :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER UNE CLASSE (Admin)
// ==================================================
router.put('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id);
    if (isNaN(id_classe))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { libelle_classe, libelle_classe_ar, libelle_classe_en, cycle, capacite_max, salle, statut } = req.body;

    if (!libelle_classe?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de classe obligatoire" });
    if (!['maternelle','primaire','college','lycee','superieur'].includes(cycle))
      return res.json({ ok: false, erreur: "⚠️ Cycle invalide" });
    if (!['ouverte','complete','fermee'].includes(statut))
      return res.json({ ok: false, erreur: "⚠️ Statut invalide" });

    const cap = Number(capacite_max);
    if (isNaN(cap) || cap < 10 || cap > 80)
      return res.json({ ok: false, erreur: "⚠️ Capacité entre 10 et 80" });

    const { rowCount } = await pool.query(`
      UPDATE classes
      SET libelle_classe = $1, libelle_classe_ar = $2, libelle_classe_en = $3,
          cycle = $4, capacite_max = $5, salle = $6, statut = $7
      WHERE id_classe = $8
    `, [libelle_classe.trim(), libelle_classe_ar || null, libelle_classe_en || null, cycle, cap, salle || null, statut, id_classe]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Classe introuvable" });

    console.log(`✅ Classe mise à jour — ID: ${id_classe}`);
    res.json({ ok: true, message: "✅ Classe mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR modification :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER UNE CLASSE (Admin)
// ==================================================
router.delete('/:id', protegerAdmin, async (req, res) => {
  try {
    const id_classe = parseInt(req.params.id);
    if (isNaN(id_classe))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rowCount } = await pool.query(
      'DELETE FROM classes WHERE id_classe = $1', [id_classe]
    );
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Classe introuvable" });

    console.log(`🗑️ Classe supprimée — ID: ${id_classe}`);
    res.json({ ok: true, message: "✅ Classe supprimée" });
  } catch (e) {
    console.error("❌ ERREUR suppression :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Impossible : cette classe est utilisée dans des affectations, notes, emplois ou présences" });
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📖 MATIÈRES — Liste publique
// ==================================================
router.get('/matieres', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id_matiere, libelle_matiere, coefficient, volume_horaire, langue_ens
      FROM matieres ORDER BY libelle_matiere ASC
    `);
    console.log(`✅ Liste matières publique — ${rows.length} élément(s)`);
    res.json({ ok: true, matieres: rows });
  } catch (e) {
    console.error("❌ ERREUR liste matières :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 📖 CRÉER/MODIFIER MATIÈRE (Admin)
// ==================================================
router.post('/matieres', protegerAdmin, async (req, res) => {
  try {
    const { libelle_matiere, coefficient, volume_horaire, langue_ens } = req.body;
    if (!libelle_matiere?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de matière obligatoire" });

    const nomNettoye = libelle_matiere.trim();
    const coef = Math.max(1, Number(coefficient) || 1);
    const vol = Math.max(0, Number(volume_horaire) || 0);
    const langue = (langue_ens || 'fr').toLowerCase().trim();

    await pool.query(`
      INSERT INTO matieres(libelle_matiere, coefficient, volume_horaire, langue_ens)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (libelle_matiere) DO UPDATE SET
        coefficient = EXCLUDED.coefficient,
        volume_horaire = EXCLUDED.volume_horaire,
        langue_ens = EXCLUDED.langue_ens
    `, [nomNettoye, coef, vol, langue]);

    console.log(`✅ Matière enregistrée : ${nomNettoye}`);
    res.json({ ok: true, message: "✅ Matière enregistrée" });
  } catch (e) {
    console.error("❌ ERREUR création matière :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// ✏️ MODIFIER MATIÈRE (Admin)
// ==================================================
router.put('/matieres/:id', protegerAdmin, async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { libelle_matiere, coefficient, volume_horaire, langue_ens } = req.body;
    if (!libelle_matiere?.trim())
      return res.json({ ok: false, erreur: "⚠️ Nom de matière obligatoire" });

    const nomNettoye = libelle_matiere.trim();
    const coef = Math.max(1, Number(coefficient) || 1);
    const vol = Math.max(0, Number(volume_horaire) || 0);
    const langue = (langue_ens || 'fr').toLowerCase().trim();

    const { rowCount } = await pool.query(`
      UPDATE matieres
      SET libelle_matiere = $1, coefficient = $2, volume_horaire = $3, langue_ens = $4
      WHERE id_matiere = $5
    `, [nomNettoye, coef, vol, langue, id_matiere]);

    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Matière introuvable" });

    console.log(`✅ Matière mise à jour — ID: ${id_matiere}`);
    res.json({ ok: true, message: "✅ Matière mise à jour" });
  } catch (e) {
    console.error("❌ ERREUR modification matière :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER MATIÈRE (Admin)
// ==================================================
router.delete('/matieres/:id', protegerAdmin, async (req, res) => {
  try {
    const id_matiere = parseInt(req.params.id);
    if (isNaN(id_matiere))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rowCount } = await pool.query(
      'DELETE FROM matieres WHERE id_matiere = $1', [id_matiere]
    );
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Matière introuvable" });

    console.log(`🗑️ Matière supprimée — ID: ${id_matiere}`);
    res.json({ ok: true, message: "✅ Matière supprimée" });
  } catch (e) {
    console.error("❌ ERREUR suppression matière :", e.code, e.message);
    if (e.code === '23503')
      return res.json({
        ok: false,
        erreur: "⚠️ Impossible : cette matière est utilisée dans des affectations, notes, emplois ou présences"
      });
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🧑‍🏫 AFFECTATIONS — Liste (Admin)
// ==================================================
router.get('/affectations', protegerAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, u.nom || ' ' || u.prenom AS nom_prof,
             c.libelle_classe, m.libelle_matiere
      FROM affectations_ens a
      JOIN utilisateurs u ON a.id_prof = u.id
      JOIN classes c ON a.id_classe = c.id_classe
      LEFT JOIN matieres m ON a.id_matiere = m.id_matiere
      ORDER BY u.nom, c.libelle_classe
    `);
    console.log(`✅ Liste affectations — ${rows.length} élément(s)`);
    res.json({ ok: true, affectations: rows });
  } catch (e) {
    console.error("❌ ERREUR liste affectations :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🧑‍🏫 CRÉER AFFECTATION (Admin)
// ==================================================
router.post('/affectations', protegerAdmin, async (req, res) => {
  try {
    const { id_prof, id_classe, id_matiere, annee_scolaire } = req.body;
    if (!id_prof || !id_classe || !id_matiere)
      return res.json({ ok: false, erreur: "⚠️ Remplissez tous les champs obligatoires" });

    await pool.query(`
      INSERT INTO affectations_ens(id_prof, id_classe, id_matiere, annee_scolaire)
      VALUES ($1, $2, $3, $4)
    `, [id_prof, id_classe, id_matiere, annee_scolaire || '2026-2027']);

    console.log("✅ Affectation enregistrée");
    res.json({ ok: true, message: "✅ Affectation enregistrée" });
  } catch (e) {
    console.error("❌ ERREUR création affectation :", e.code, e.message);
    if (e.code === '23503')
      return res.json({ ok: false, erreur: "⚠️ Prof, Classe ou Matière introuvable" });
    if (e.code === '23505')
      return res.json({ ok: false, erreur: "⚠️ Cette affectation existe déjà" });
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 🗑️ SUPPRIMER AFFECTATION (Admin)
// ==================================================
router.delete('/affectations/:id', protegerAdmin, async (req, res) => {
  try {
    const id_affectation = parseInt(req.params.id);
    if (isNaN(id_affectation))
      return res.json({ ok: false, erreur: "⚠️ Identifiant invalide" });

    const { rowCount } = await pool.query(
      'DELETE FROM affectations_ens WHERE id_affectation = $1', [id_affectation]
    );
    if (rowCount === 0)
      return res.json({ ok: false, erreur: "⚠️ Affectation introuvable" });

    console.log(`🗑️ Affectation supprimée — ID: ${id_affectation}`);
    res.json({ ok: true, message: "✅ Affectation supprimée" });
  } catch (e) {
    console.error("❌ ERREUR suppression affectation :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 👨‍🏫 MES CLASSES (Prof connecté)
// ==================================================
router.get('/prof/classes', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    const { rows } = await pool.query(`
      SELECT DISTINCT c.id_classe AS id, c.libelle_classe AS nom,
             c.libelle_classe_ar, c.libelle_classe_en, c.cycle,
             c.capacite_max, (c.capacite_max - c.places_occupees) AS places_restantes
      FROM affectations_ens a
      JOIN classes c ON a.id_classe = c.id_classe
      WHERE a.id_prof = $1 ORDER BY c.libelle_classe ASC
    `, [id_prof]);
    console.log(`✅ Mes classes chargées — ${rows.length} élément(s)`);
    res.json({ ok: true, classes: rows });
  } catch (e) {
    console.error("❌ ERREUR mes classes :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

// ==================================================
// 👨‍🏫 MES MATIÈRES (Prof connecté)
// ==================================================
router.get('/prof/matieres', protegerProf, async (req, res) => {
  try {
    const id_prof = req.user.id;
    const { rows } = await pool.query(`
      SELECT DISTINCT m.id_matiere, m.libelle_matiere, m.coefficient, m.volume_horaire, m.langue_ens
      FROM affectations_ens a
      JOIN matieres m ON a.id_matiere = m.id_matiere
      WHERE a.id_prof = $1 ORDER BY m.libelle_matiere ASC
    `, [id_prof]);
    console.log(`✅ Mes matières chargées — ${rows.length} élément(s)`);
    res.json({ ok: true, matieres: rows });
  } catch (e) {
    console.error("❌ ERREUR mes matières :", e.code, e.message);
    res.json({ ok: false, erreur: e.message });
  }
});

module.exports = router;