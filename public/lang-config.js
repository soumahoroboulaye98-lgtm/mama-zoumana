// ==================================================
// 🌍 CONFIGURATION TRILINGUE — FR / EN / AR
// ==================================================
const traductions = {
  fr: {
    accueil: "Accueil",
    deconnexion: "Déconnexion",
    connexion: "Connexion",
    utilisateur: "Utilisateur",
    
    // Emploi du temps
    gestionEmploi: "Gestion de l'Emploi du Temps",
    emploiTemps: "Emploi du Temps",
    ajouterCours: "Ajouter un Cours",
    modifierCours: "Modifier le Cours",
    choisirClasse: "Sélectionnez une classe",
    choisirProf: "Choisir le professeur",
    jour: "Jour",
    heureDebut: "Heure Début",
    heureFin: "Heure Fin",
    matiere: "Matière",
    professeur: "Professeur",
    enregistrer: "Enregistrer",
    supprimer: "Supprimer",
    actions: "Actions",
    lundi: "Lundi",
    mardi: "Mardi",
    mercredi: "Mercredi",
    jeudi: "Jeudi",
    vendredi: "Vendredi",
    samedi: "Samedi",
    listeCours: "Liste des Cours",
    horaires: "Horaire",
    confirmerSuppression: "Confirmer la suppression ?",
    coursAjoute: "✅ Cours ajouté avec succès !",
    coursModifie: "✅ Cours modifié avec succès !",
    coursSupprime: "✅ Cours supprimé avec succès !",
    selectionnerClasseDabord: "⚠️ Sélectionnez d'abord une classe !",
    
    // Consultation classe
    consultationClasse: "Consultation Classe & Élèves",
    listeEleves: "Liste des Élèves",
    effectif: "Effectif",
    classementGeneral: "Classement Général",
    voirClassementNotes: "Voir Classement par Notes",
    emploiTempsGeneral: "Emploi du Temps Général",
    retour: "Retour",
    matricule: "Matricule",
    nomPrenoms: "Nom & Prénoms",
    contact: "Contact",
    aucuneDonnee: "Aucune donnée disponible",
    chargement: "Chargement...",
    
    // Classement notes
    classementNotes: "Classement par Notes & Moyenne",
    modeAffichage: "Mode d'affichage",
    parClasse: "Par Classe",
    generalToutesClasses: "Général — Toutes Classes",
    rang: "Rang",
    moyenne: "Moyenne",
    mention: "Mention",
    appreciation: "Appréciation",
    legendeMentions: "🏅 Légende des Mentions",
    tousClasses: "Toutes Classes",
    eleve: "élève(s)",
    aucunResultat: "Aucun résultat",
    erreurChargement: "Erreur de chargement",
    classe: "Classe",
    niveau: "Niveau",
    totalEleves: "Total Élèves",
    
    // Mentions
    mentionTB: "Très Bien 🎖️",
    mentionB: "Bien 🎉",
    mentionAB: "Assez Bien ✅",
    mentionP: "Passable",
    mentionI: "Insuffisant ⚠️",
    mentionAucune: "Aucune note",
    
    // Ressources
    ressourcesEducatives: "Ressources Éducatives & Recherche",
    rechercherInternet: "Rechercher sur Internet",
    rechercher: "Rechercher",
    plateformesEcoles: "Plateformes Éducatives",
    bibliotheques: "Bibliothèques en Ligne",
    ressourcesIslamiques: "Ressources Islamiques",
    ajouterLiens: "Ajouter vos propres liens",
    retourAccueil: "Retour à l'Accueil",
    indicationLiens: "Ces liens sont proposés à titre indicatif. Ajoutez les vôtres dans le fichier."
  },

  en: {
    accueil: "Home",
    deconnexion: "Sign Out",
    connexion: "Sign In",
    utilisateur: "User",
    
    gestionEmploi: "Schedule Management",
    emploiTemps: "School Schedule",
    ajouterCours: "Add Class",
    modifierCours: "Edit Class",
    choisirClasse: "Select a class",
    choisirProf: "Select teacher",
    jour: "Day",
    heureDebut: "Start Time",
    heureFin: "End Time",
    matiere: "Subject",
    professeur: "Teacher",
    enregistrer: "Save",
    supprimer: "Delete",
    actions: "Actions",
    lundi: "Monday",
    mardi: "Tuesday",
    mercredi: "Wednesday",
    jeudi: "Thursday",
    vendredi: "Friday",
    samedi: "Saturday",
    listeCours: "Class List",
    horaires: "Time",
    confirmerSuppression: "Confirm deletion ?",
    coursAjoute: "✅ Class added successfully!",
    coursModifie: "✅ Class updated successfully!",
    coursSupprime: "✅ Class deleted successfully!",
    selectionnerClasseDabord: "⚠️ Select a class first!",
    
    consultationClasse: "Class & Students Overview",
    listeEleves: "Student List",
    effectif: "Students",
    classementGeneral: "General Ranking",
    voirClassementNotes: "View Grades Ranking",
    emploiTempsGeneral: "General Schedule",
    retour: "Back",
    matricule: "Student ID",
    nomPrenoms: "Full Name",
    contact: "Contact",
    aucuneDonnee: "No data available",
    chargement: "Loading...",
    
    classementNotes: "Grades & Average Ranking",
    modeAffichage: "Display Mode",
    parClasse: "By Class",
    generalToutesClasses: "General — All Classes",
    rang: "Rank",
    moyenne: "Average",
    mention: "Honors",
    appreciation: "Feedback",
    legendeMentions: "🏅 Honors Legend",
    tousClasses: "All Classes",
    eleve: "student(s)",
    aucunResultat: "No results",
    erreurChargement: "Loading error",
    classe: "Class",
    niveau: "Level",
    totalEleves: "Total Students",
    
    mentionTB: "Excellent 🎖️",
    mentionB: "Very Good 🎉",
    mentionAB: "Good ✅",
    mentionP: "Satisfactory",
    mentionI: "Needs Improvement ⚠️",
    mentionAucune: "No grade",
    
    ressourcesEducatives: "Educational Resources & Search",
    rechercherInternet: "Search the Web",
    rechercher: "Search",
    plateformesEcoles: "Educational Platforms",
    bibliotheques: "Online Libraries",
    ressourcesIslamiques: "Islamic Resources",
    ajouterLiens: "Add your own links",
    retourAccueil: "Back to Home",
    indicationLiens: "These links are for reference. Add yours in the file."
  },

  ar: {
    accueil: "الرئيسية",
    deconnexion: "تسجيل الخروج",
    connexion: "تسجيل الدخول",
    utilisateur: "المستخدم",
    
    gestionEmploi: "إدارة الجدول الدراسي",
    emploiTemps: "الجدول الدراسي",
    ajouterCours: "إضافة حصة",
    modifierCours: "تعديل الحصة",
    choisirClasse: "اختر الفصل",
    choisirProf: "اختر المعلم",
    jour: "اليوم",
    heureDebut: "وقت البدء",
    heureFin: "وقت الانتهاء",
    matiere: "المادة",
    professeur: "المعلم",
    enregistrer: "حفظ",
    supprimer: "حذف",
    actions: "الإجراءات",
    lundi: "الاثنين",
    mardi: "الثلاثاء",
    mercredi: "الأربعاء",
    jeudi: "الخميس",
    vendredi: "الجمعة",
    samedi: "السبت",
    listeCours: "قائمة الحصص",
    horaires: "الوقت",
    confirmerSuppression: "تأكيد الحذف ؟",
    coursAjoute: "✅ تمت إضافة الحصة بنجاح !",
    coursModifie: "✅ تم تعديل الحصة بنجاح !",
    coursSupprime: "✅ تم حذف الحصة بنجاح !",
    selectionnerClasseDabord: "⚠️ اختر الفصل أولاً !",
    
    consultationClasse: "استعراض الفصل والطلاب",
    listeEleves: "قائمة الطلاب",
    effectif: "العدد",
    classementGeneral: "الترتيب العام",
    voirClassementNotes: "عرض ترتيب الدرجات",
    emploiTempsGeneral: "الجدول العام",
    retour: "رجوع",
    matricule: "الرقم الجامعي",
    nomPrenoms: "الاسم الكامل",
    contact: "الاتصال",
    aucuneDonnee: "لا توجد بيانات",
    chargement: "جارٍ التحميل...",
    
    classementNotes: "ترتيب الدرجات والمعدلات",
    modeAffichage: "طريقة العرض",
    parClasse: "حسب الفصل",
    generalToutesClasses: "عام — جميع الفصول",
    rang: "الترتيب",
    moyenne: "المعدل",
    mention: "التقدير",
    appreciation: "الملاحظة",
    legendeMentions: "🏅 دليل التقديرات",
    tousClasses: "جميع الفصول",
    eleve: "طالب",
    aucunResultat: "لا توجد نتائج",
    erreurChargement: "خطأ في التحميل",
    classe: "الفصل",
    niveau: "المستوى",
    totalEleves: "إجمالي الطلاب",
    
    mentionTB: "ممتاز 🎖️",
    mentionB: "جيد جداً 🎉",
    mentionAB: "جيد ✅",
    mentionP: "مقبول",
    mentionI: "ضعيف ⚠️",
    mentionAucune: "لا توجد درجة",
    
    ressourcesEducatives: "مصادر تعليمية وبحث",
    rechercherInternet: "البحث في الإنترنت",
    rechercher: "بحث",
    plateformesEcoles: "منصات تعليمية",
    bibliotheques: "المكتبات الإلكترونية",
    ressourcesIslamiques: "مصادر إسلامية",
    ajouterLiens: "إضافة روابطك الخاصة",
    retourAccueil: "العودة للرئيسية",
    indicationLiens: "هذه الروابط للإشارة فقط. يمكنك إضافة روابطك في الملف."
  }
};

// Langue par défaut
let langueActuelle = localStorage.getItem('langue') || 'fr';

// Appliquer la langue
function changerLangue(lang) {
  langueActuelle = lang;
  localStorage.setItem('langue', lang);
  appliquerTraductions();
  
  // Direction arabe
  document.documentElementbe
  document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}

// Appliquer toutes les traductions
function appliquerTraductions() {
  const t = traductions[langueActuelle];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const cle = el.getAttribute('data-i18n');
    if (t[cle]) el.textContent = t[cle];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const cle = el.getAttribute('data-i18n-placeholder');
    if (t[cle]) el.placeholder = t[cle];
  });
}

// Initialisation au chargement
window.onload = () => {
  document.getElementById('selecteurLangue').value = langueActuelle;
  appliquerTraductions();
};