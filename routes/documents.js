// ==================================================
 // ROUTE /api/documents/delivrer
// ==================================================
router.post('/delivrer', protegerAdmin, async (req, res) => {
  try {
    const { id_eleve, id_employe, type_doc, annee_scolaire, numero_unique } = req.body;
    const r = await pool.query(`
      INSERT INTO documents_delivres(id_eleve, id_employe, type_document, annee_scolaire, numero_unique, date_delivrance, id_utilisateur_admin)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      RETURNING *
    `, [id_eleve||null, id_employe||null, type_doc, annee_scolaire, numero_unique, req.user?.id_utilisateur]);
    res.json({ ok: true, document: r.rows[0] });
  } catch (e) {
    console.error("❌ Erreur document :", e.message);
    res.json({ ok: false, erreur: e.message });
  }
});