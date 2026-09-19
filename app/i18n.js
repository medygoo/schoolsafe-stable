(function () {
  "use strict";

  var STORAGE_KEY = "schoolsafe-v2-language";
  var DOCUMENT_KEY = "schoolsafe-v2-document-language";
  var currentLanguage = window.localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "fr";
  var originalTextNodes = new WeakMap();
  var renderedTextNodes = new WeakMap();
  var originalAttributes = new WeakMap();
  var renderedAttributes = new WeakMap();

  var frToEn = {
    "Connexion en cours…": "Signing in…",
    "Renseignez un numéro de téléphone valide.": "Enter a valid phone number.",
    "Renseignez une adresse e-mail valide.": "Enter a valid email address.",
    "Réponse de connexion incomplète. Réessayez.": "Incomplete sign-in response. Please try again.",
    "Service de connexion indisponible. Rechargez la page.": "Sign-in service unavailable. Reload the page.",
    "Configurer l’école et autres accès": "School setup and other access",
    "Je vous accompagne pour retrouver votre accès.": "Let's recover your access together.",
    "Découvrez SchoolSafe avec les données de démonstration.": "Explore SchoolSafe with demonstration data.",
    "Entrez votre numéro de téléphone pour continuer.": "Enter your phone number to continue.",
    "Entrez votre adresse e-mail pour continuer.": "Enter your e-mail address to continue.",
    "Ensemble pour une école": "Together for a school",
    "plus sûre et plus connectée": "that is safer and more connected",
    "Bienvenue sur SchoolSafe": "Welcome to SchoolSafe",
    "Un espace plus sûr et plus connecté pour toute la communauté scolaire.": "A safer, more connected space for the whole school community.",
    "Les engagements SchoolSafe": "SchoolSafe commitments",
    "Éduquer": "Educate",
    "Des outils pour apprendre et grandir": "Tools to learn and grow",
    "Les élèves en sécurité à chaque étape": "Keeping students safe at every step",
    "Une école plus proche des familles": "Bringing schools closer to families",
    "Pour demain": "For tomorrow",
    "Un avenir meilleur ensemble": "A better future together",
    "Avec vous,": "By your side,",
    "pour leur avenir": "for their future",
    "Connectez-vous à un environnement plus sûr et plus serein.": "Sign in to a safer, more reassuring environment.",
    "Protéger": "Protect",
    "Les élèves au quotidien": "Students, every day",
    "Connecter": "Connect",
    "École, parents et enseignants": "School, parents and teachers",
    "Construire": "Build",
    "Un meilleur avenir": "A better future",
    "Bonjour ! Je suis Jaspe, votre assistante. Entrez vos identifiants pour continuer.": "Hello! I'm Jaspe, your assistant. Enter your sign-in details to continue.",
    "Vos données restent dans votre école, en toute confiance.": "Your school keeps control of its data.",
    "Un souci ? « Mot de passe oublié » ou la démonstration ci-dessous.": "Need help? Try “Forgot password” or the demonstration below.",
    "Je vous écoute…": "I'm listening…",
    "Je vérifie vos identifiants…": "Checking your sign-in details…",
    "Hmm… vérifiez vos identifiants et réessayez.": "Please check your sign-in details and try again.",
    "Bienvenue ! J'ouvre votre espace…": "Welcome! Opening your workspace…",
    "Commencer": "Get started",
    "Chaque enfant": "Every child",
    "Chaque parent": "Every parent",
    "protégé": "protected",
    "informé": "informed",
    "L'école en toute confiance": "A school you can trust",
    "Des enfants plus en sécurité": "Safer children",
    "pour un meilleur demain": "for a better tomorrow",
    "Présences, suivi scolaire et échanges avec les familles : votre école réunie dans un même espace.": "Attendance, learning progress and communication with families: your school, all in one place.",
    "Appuyez pour continuer": "Tap to continue",
    "Continuer": "Continue",
    "Une école. Une instance. Une confiance.": "One school. One instance. One trust.",
    "Bienvenue dans votre espace sécurisé.": "Welcome to your secure workspace.",
    "La continuité SchoolSafe, avec une organisation plus claire pour chaque profil.": "SchoolSafe continuity, with a clearer workspace for every role.",
    "Connexion": "Sign in",
    "Accédez à votre établissement": "Access your school",
    "Mode de connexion": "Sign-in method",
    "E-mail": "Email",
    "Téléphone": "Phone",
    "Adresse e-mail": "Email address",
    "Numéro de téléphone": "Phone number",
    "Mot de passe": "Password",
    "Mot de passe oublié": "Forgot password",
    "Rester connecté sur cet appareil": "Stay signed in on this device",
    "Se connecter": "Sign in",
    "Accès de démonstration actif": "Demo access enabled",
    "Profil à prévisualiser": "Role to preview",
    "Nouvelle instance SchoolSafe": "New SchoolSafe instance",
    "Configurer l'école": "Configure the school",
    "Accès protégé": "Protected access",
    "Configuration de l'instance": "Instance setup",
    "Instance mono-école": "Single-school instance",
    "Aucune donnée n'est envoyée dans cette prévisualisation.": "No data is sent from this preview.",
    "Identité de l'école": "School identity",
    "Identité": "Identity",
    "Cycles": "Cycles",
    "Année scolaire": "Academic year",
    "Coordonnées": "Contact details",
    "Identité visuelle": "Visual identity",
    "Administrateur": "Administrator",
    "Récapitulatif": "Summary",
    "Retour": "Back",
    "Continuer la configuration": "Continue setup",
    "Brouillon local": "Local draft",
    "Instance école": "School instance",
    "Configuration en cours": "Setup in progress",
    "Tableau de bord": "Dashboard",
    "Pilotage": "Management",
    "École": "School",
    "Élèves": "Students",
    "Sécurité et accès": "Security and access",
    "Sécurité et contrôle": "Security and control",
    "Pédagogie": "Academics",
    "Finances": "Finance",
    "Comptabilité": "Accounting",
    "Personnel": "Staff",
    "Communication": "Communication",
    "Vie et bien-être": "Student life and wellbeing",
    "Administration": "Administration",
    "Contrôle et rapports": "Control and reports",
    "Rôles et accès": "Roles and access",
    "Retour à la connexion": "Back to sign in",
    "Administrateur principal": "Principal administrator",
    "Chef d’établissement": "Head of school",
    "Responsable pédagogique": "Academic coordinator",
    "Responsable administratif et admissions": "Administration and admissions manager",
    "Secrétaire scolaire": "School secretary",
    "Responsable financier": "Finance manager",
    "Agent de caisse": "Cashier",
    "Comptable": "Accountant",
    "Responsable RH": "Human resources manager",
    "Enseignant": "Teacher",
    "Agent de contrôle d’accès": "Access control officer",
    "Infirmier": "School nurse",
    "Responsable cantine": "Canteen manager",
    "Responsable communication et site": "Communication and website manager",
    "Parent ou responsable légal": "Parent or legal guardian",
    "Profil actif": "Active role",
    "Périmètre": "Scope",
    "Branches actives": "Active branches",
    "Accès autorisé": "Access granted",
    "Pilotage global": "School-wide management",
    "Priorités de mon poste": "My role priorities",
    "Selon le rôle et le périmètre attribués": "Based on the assigned role and scope",
    "Informations communes de l’école": "School-wide information",
    "Visibles par tous selon le niveau de confidentialité": "Visible according to confidentiality level",
    "Journée scolaire": "School day",
    "Activités normales · instance en configuration": "Normal activities · instance being configured",
    "Annonce générale": "General announcement",
    "Aucun message urgent actuellement": "No urgent message at this time",
    "Calendrier de l’école": "School calendar",
    "Événements à synchroniser": "Events to synchronize",
    "Situation générale": "General status",
    "Accès et services opérationnels": "Access and services operational",
    "Production de cartes SchoolSafe": "SchoolSafe card production",
    "Sous-système protégé, conservé à l’identique et branché uniquement par contrat.": "Protected subsystem, preserved unchanged and connected only by contract.",
    "Intact": "Unchanged",
    "Espace pédagogique": "Academic workspace",
    "Configuration locale de démonstration. Aucune donnée distante n’est utilisée.": "Local demo configuration. No remote data is used.",
    "Devoirs": "Assignments",
    "Cotations": "Grades",
    "Calculs": "Calculations",
    "Bulletin continu": "Continuous report card",
    "Rattrapage": "Remediation",
    "Épreuves nationales": "National examinations",
    "Vue parent": "Parent view",
    "Espace financier": "Finance workspace",
    "Situation financière": "Financial status",
    "Vue financière": "Financial overview",
    "Structure des frais": "Fee structure",
    "Encaissements": "Recorded payments",
    "Reçus": "Receipts",
    "Soldes": "Balances",
    "Rapports": "Reports",
    "Ma famille": "My family",
    "Administration des accès": "Access administration",
    "Attribuer un rôle et limiter son périmètre": "Assign a role and limit its scope",
    "Rôle": "Role",
    "Type de périmètre": "Scope type",
    "Valeur du périmètre": "Scope value",
    "Portail": "Gate",
    "Classe": "Class",
    "Cycle": "Cycle",
    "Service": "Department",
    "Enfants rattachés": "Linked children",
    "Toute l’instance": "Entire instance",
    "Enregistrer le brouillon": "Save draft",
    "Démonstration locale uniquement": "Local demo only",
    "Continuité SchoolSafe": "SchoolSafe continuity",
    "État de synchronisation": "Synchronization status",
    "Synchronisé": "Synchronized",
    "Démo locale": "Local demo",
    "Sans connexion": "Offline",
    "Synchronisation": "Synchronizing",
    "Reprise automatique": "Automatic resume",
    "Ordre automatique de reprise": "Automatic resume order",
    "Les tâches essentielles passent en premier": "Essential tasks are processed first",
    "Scans et sécurité": "Scans and security",
    "Entrées, sorties et alertes": "Entries, exits and alerts",
    "Messages urgents": "Urgent messages",
    "Alertes et convocations": "Alerts and notices",
    "Devoirs et pièces jointes": "Assignments and attachments",
    "Pièces jointes et cotations": "Attachments and grades",
    "Présences et services": "Attendance and services",
    "Personnel, biométrie et cantine": "Staff, biometrics and canteen",
    "Gestion": "Management",
    "Pédagogie, finances et administration": "Academics, finance and administration",
    "File de l’appareil": "Device queue",
    "Aucune opération en attente": "No pending operation",
    "Cette prévisualisation confirme les opérations localement pour tester le parcours. Elle ne prouve aucune synchronisation avec le serveur de l’école.": "This preview confirms operations locally to test the workflow. It does not prove any synchronization with the school server.",
    "Synchroniser maintenant": "Synchronize now",
    "Installer SchoolSafe": "Install SchoolSafe",
    "Français": "French",
    "Anglais": "English",
    "Documents PDF": "PDF documents",
    "Version bilingue": "Bilingual version",
    "Traduction non disponible": "Translation unavailable",
    "Traduction non disponible : contenu original conservé.": "Translation unavailable: original content retained.",
    "Devoir PDF téléchargé avec sa mise en page A4.": "Assignment PDF downloaded in its A4 layout.",
    "Texte original": "Original text",
    "Langue": "Language",
    "Paramètres de langue": "Language settings",
    "Interface": "Interface",
    "Chaque arrivée compte.": "Every arrival matters.",
    "Chaque sortie est protégée.": "Every departure is protected.",
    "Chaque enfant protégé, chaque parent informé": "Every child protected, every parent informed",
    "République démocratique du Congo": "Democratic Republic of the Congo",
    "Sécurité scolaire": "School safety",
    "Reçu de paiement": "Payment receipt",
    "Montant reçu et enregistré": "Amount received and recorded",
    "Traçabilité SchoolSafe": "SchoolSafe traceability",
    "Signature de l’agent de caisse": "Cashier signature",
    "Signature du payeur": "Payer signature",
    "Rapport de caisse": "Cash report",
    "Opérations enregistrées": "Recorded operations",
    "Dépenses consignées": "Recorded expenses",
    "Enseignant :": "Teacher:",
    "Date :": "Date:",
    "Nom de l’élève :": "Student name:",
    "Matricule :": "Student ID:",
    "Prérequis": "Prerequisites",
    "Consignes": "Instructions",
    "Classe :": "Class:",
    "Numéro :": "Number:",
    "Centre :": "Center:",
    "NON PUBLIÉ": "NOT PUBLISHED",
    "À renseigner": "To be completed",
    "Statut": "Status",
    "Page": "Page",
    "Statistiques": "Statistics",
    "Alertes importantes": "Important alerts",
    "Indicateurs": "Indicators",
    "Administrer les élèves et leur parcours": "Manage students and their school journey",
    "Scolarité": "School records",
    "Classes": "Classes",
    "Parent principal et tuteurs": "Primary parent and guardians",
    "Inscriptions et réinscriptions": "Enrollments and re-enrollments",
    "Organisation": "Organization",
    "Affectations": "Assignments",
    "Import massif": "Bulk import",
    "Documents élèves": "Student documents",
    "Gérer les équipes et leurs affectations": "Manage teams and assignments",
    "Équipe": "Team",
    "Enseignants": "Teachers",
    "Contrats": "Contracts",
    "Temps et paie": "Time and payroll",
    "Présence du personnel": "Staff attendance",
    "Biométrie": "Biometrics",
    "Salaires": "Salaries",
    "Avances, primes et retenues": "Advances, bonuses and deductions",
    "Suivre l’apprentissage et les résultats": "Monitor learning and results",
    "Organisation pédagogique": "Academic organization",
    "Matières": "Subjects",
    "Emplois du temps": "Timetables",
    "Présences, absences et retards": "Attendance, absences and lateness",
    "Devoirs et corrections": "Assignments and grading",
    "Évaluation": "Assessment",
    "Évaluations et notes": "Assessments and grades",
    "Moyennes et coefficients": "Averages and coefficients",
    "Bulletins": "Report cards",
    "Palmarès": "Honor roll",
    "Accompagnement": "Student support",
    "Rattrapage pédagogique": "Academic remediation",
    "Cahiers de préparation": "Lesson preparation books",
    "Épreuves certificatives": "Certification examinations",
    "Superviser les accès et les sorties": "Supervise access and departures",
    "Action et contrôle": "Action and control",
    "Scanner un QR": "Scan a QR code",
    "Entrées": "Entries",
    "Sorties": "Exits",
    "Préparer une sortie": "Prepare a departure",
    "Autorisation et suivi": "Authorization and monitoring",
    "Personnes autorisées": "Authorized persons",
    "Confirmer ou refuser une sortie": "Confirm or refuse a departure",
    "Alertes et anomalies": "Alerts and anomalies",
    "Historique des passages": "Access history",
    "Contrôler la situation financière": "Monitor the financial situation",
    "Frais et caisse": "Fees and cashiering",
    "Reçus PDF": "PDF receipts",
    "Impayés et soldes": "Outstanding fees and balances",
    "Trésorerie": "Treasury",
    "Recettes et dépenses": "Income and expenses",
    "Rapports de caisse": "Cash reports",
    "Clôtures": "Closures",
    "Exports financiers": "Financial exports",
    "Tenir et contrôler la comptabilité": "Maintain and control accounting",
    "Écritures": "Entries",
    "Plan comptable": "Chart of accounts",
    "Journal comptable": "Accounting journal",
    "Grand livre": "General ledger",
    "Écritures comptables": "Accounting entries",
    "États": "Statements",
    "Rapprochements": "Reconciliations",
    "États financiers": "Financial statements",
    "Rapports SYSCOHADA": "SYSCOHADA reports",
    "Informer la communauté scolaire": "Inform the school community",
    "Échanges": "Communication",
    "Messages": "Messages",
    "Notifications": "Notifications",
    "Annonces": "Announcements",
    "Convocations": "Notices",
    "Publication": "Publishing",
    "Site public et WebSync": "Public website and WebSync",
    "Événements": "Events",
    "Gouverner et conserver les preuves": "Govern and preserve evidence",
    "Documents R2": "R2 documents",
    "Archives": "Archives",
    "Paramètres": "Settings",
    "Comptes et droits": "Accounts and permissions",
    "Plateforme": "Platform",
    "Français et anglais": "French and English",
    "Mode hors ligne": "Offline mode",
    "Séparation public et privé": "Public and private data separation",
    "Contrôler l’activité": "Monitor activity",
    "Traçabilité": "Traceability",
    "Historiques": "History",
    "Audit des actions": "Action audit",
    "Rapports administratifs": "Administrative reports",
    "Exports PDF et Excel": "PDF and Excel exports",
    "Action immédiate": "Immediate action",
    "Enregistrer une entrée": "Record an entry",
    "Enregistrer une sortie": "Record an exit",
    "Contrôle": "Control",
    "Vérifier l’identité": "Verify identity",
    "Autoriser une sortie": "Authorize a departure",
    "Refuser une sortie": "Refuse a departure",
    "Surveillance": "Monitoring",
    "Élèves dans l’école": "Students on school grounds",
    "Sorties en attente": "Pending departures",
    "Historique": "History",
    "Passages précédents": "Previous access records",
    "Incidents": "Incidents",
    "Rechercher": "Search",
    "Mes classes": "My classes",
    "Emploi du temps": "Timetable",
    "Travail pédagogique": "Academic work",
    "Cahier de préparation de l’enseignant": "Teacher lesson preparation book",
    "Suivi des élèves": "Student monitoring",
    "Résultats et moyennes": "Results and averages",
    "Difficultés": "Difficulties",
    "Bulletins à consulter": "Report cards to review",
    "Préparation aux épreuves certificatives": "Certification examination preparation",
    "Échanges autorisés": "Authorized communication",
    "Parents autorisés": "Authorized parents",
    "Enregistrer un paiement": "Record a payment",
    "Versement de rattrapage": "Remediation payment record",
    "Rechercher un élève": "Find a student",
    "Produire un reçu PDF": "Produce a PDF receipt",
    "Vérifier un paiement": "Verify a payment",
    "Consulter le solde et les impayés": "View balances and outstanding fees",
    "Historique du jour": "Daily history",
    "Demander l’annulation d’un paiement": "Request payment cancellation",
    "Clôture": "Closure",
    "Soumettre la journée": "Submit the day",
    "Documents financiers": "Financial documents",
    "Reçus et opérations": "Receipts and operations",
    "Aucun paiement en ligne": "No online payment",
    "Situation de l’élève": "Student financial status",
    "Enregistrer une tranche": "Record an installment",
    "Type de frais": "Fee type",
    "Montant reçu en FC": "Amount received in FC",
    "Mode constaté": "Recorded method",
    "Référence ou observation": "Reference or note",
    "Enregistrer et préparer le reçu": "Record and prepare the receipt",
    "Opérations du jour": "Today's operations",
    "Après synchronisation": "After synchronization",
    "En attente de synchronisation": "Awaiting synchronization",
    "PDF après synchronisation": "PDF after synchronization",
    "Situation familiale": "Family financial status",
    "Frais scolaires et reçus": "School fees and receipts",
    "Enfant suivi": "Child",
    "Frais attendus": "Expected fees",
    "Montants enregistrés": "Recorded amounts",
    "Solde restant": "Remaining balance",
    "Résultat officiel de fin de période": "Official end-of-period result",
    "Reçus disponibles": "Available receipts",
    "Devoirs et cotations": "Assignments and grades",
    "Classes affectées": "Assigned classes",
    "Matières enseignées": "Subjects taught",
    "Total élèves": "Total students",
    "Filles": "Girls",
    "Garçons": "Boys",
    "Cours aujourd’hui": "Classes today",
    "Présence moyenne": "Average attendance",
    "Devoirs à corriger": "Assignments to grade",
    "Moyenne des classes": "Class average",
    "Élèves à accompagner": "Students needing support",
    "Présence à effectuer": "Attendance to record",
    "Cours prévus": "Scheduled classes",
    "Devoirs et activités": "Assignments and activities",
    "Cotations des élèves": "Student grading",
    "Calculs et coefficients": "Calculations and coefficients",
    "Épreuves certificatives": "Certification examinations",
    "Suivi de mon enfant": "My child’s progress",
    "Travaux de la classe": "Class assignments",
    "Composer un devoir SchoolSafe": "Create a SchoolSafe assignment",
    "Le contenu saisi sera aligné dans un modèle A4 avec l’identité officielle de l’école.": "The content will be laid out in an A4 template with the school’s official identity.",
    "Titre": "Title",
    "Titre du devoir": "Assignment title",
    "Veuillez renseigner le titre du devoir avant de produire le PDF.": "Enter the assignment title before generating the PDF.",
    "Matière": "Subject",
    "Mathématiques": "Mathematics",
    "Autre": "Other",
    "Type": "Type",
    "Devoir": "Assignment",
    "Interrogation": "Quiz",
    "Examen": "Exam",
    "Activité compensatoire": "Make-up activity",
    "Barème total": "Total points",
    "Date de remise": "Due date",
    "À planifier": "To be scheduled",
    "Connaissances nécessaires avant le devoir...": "Knowledge required before the assignment...",
    "Consignes générales": "General instructions",
    "Consignes de travail...": "Assignment instructions...",
    "Pièce jointe facultative": "Optional attachment",
    "Une photo ou un PDF peut accompagner le devoir composé. Le fichier reste local dans cette démonstration.": "A photo or PDF can accompany the assignment. The file remains local in this demo.",
    "Contenu du document": "Document content",
    "Questions et espaces de réponse": "Questions and answer spaces",
    "Ajouter une question": "Add a question",
    "SchoolSafe évite de couper une question entre deux pages et ajoute automatiquement les lignes, cadres de dessin ou pages de réponse demandées.": "SchoolSafe keeps each question together and automatically adds the requested lines, drawing frames or answer pages.",
    "Aperçu PDF": "PDF preview",
    "Publier aux parents": "Publish to parents",
    "Question": "Question",
    "Supprimer la question": "Delete question",
    "Énoncé": "Question text",
    "Réponse courte": "Short answer",
    "Réponse longue": "Long answer",
    "Calcul": "Calculation",
    "Dessin": "Drawing",
    "Choix multiple": "Multiple choice",
    "Points": "Points",
    "Espace de réponse": "Answer space",
    "3 lignes": "3 lines",
    "5 lignes": "5 lines",
    "8 lignes": "8 lines",
    "Demi-page": "Half page",
    "Page entière": "Full page",
    "Choix séparés par un point-virgule": "Choices separated by semicolons",
    "Publié": "Published",
    "Brouillon": "Draft",
    "Échéance": "Due date",
    "Support": "Format",
    "Version": "Version",
    "Barème": "Points",
    "Qualitatif": "Qualitative",
    "Télécharger le devoir PDF": "Download assignment PDF",
    "Coter ce travail": "Grade this assignment",
    "Cotation de la classe": "Class grading",
    "Travail": "Assignment",
    "Non observé": "Not observed",
    "À renforcer": "Needs reinforcement",
    "En acquisition": "Developing",
    "Acquis": "Achieved",
    "Bien": "Good",
    "Très bien": "Very good",
    "Excellent": "Excellent",
    "Absent": "Absent",
    "Présent": "Present",
    "Rattrapage requis": "Make-up required",
    "Dispensé": "Excused",
    "En règle": "Up to date",
    "Cotes remplies": "Grades entered",
    "Publication": "Publication",
    "Visible": "Visible",
    "Élève": "Student",
    "Cotation": "Grade",
    "Situation": "Status",
    "Statut administratif": "Administrative status",
    "Les montants financiers ne sont jamais visibles ici.": "Financial amounts are never shown here.",
    "Publier les cotes": "Publish grades",
    "Calendrier des résultats": "Results calendar",
    "Périodes scolaires": "Academic periods",
    "Organisation": "Organization",
    "Trimestres": "Terms",
    "Semestres": "Semesters",
    "Périodes personnalisées": "Custom periods",
    "Nombre de périodes": "Number of periods",
    "Seuil de réussite": "Pass mark",
    "Décimales": "Decimal places",
    "Calcul de période": "Period calculation",
    "Poids des évaluations": "Assessment weights",
    "Interrogations": "Quizzes",
    "Examens": "Exams",
    "Total": "Total",
    "École bilingue": "Bilingual school",
    "Langues d’enseignement": "Languages of instruction",
    "Matière éliminatoire": "Eliminating subject",
    "Option désactivée": "Disabled",
    "Au moins une matière": "At least one subject",
    "Chaque langue garde ses matières et ses cotations dans le bulletin unique.": "Each language keeps its subjects and grades in the single report card.",
    "Vie scolaire": "Student life",
    "Calcul de la conduite": "Conduct calculation",
    "Responsable de discipline": "Discipline coordinator",
    "Décision de l’enseignant": "Teacher decision",
    "Remplace la note initiale": "Replace the original grade",
    "Conserve les deux notes": "Keep both grades",
    "Les résultats clôturés ne seront jamais recalculés silencieusement.": "Closed results are never recalculated silently.",
    "Enregistrer les règles": "Save rules",
    "École de démonstration SchoolSafe": "SchoolSafe demonstration school",
    "Instance locale non configurée": "Unconfigured local instance",
    "E-mail de l’école à configurer": "School email to configure",
    "Adresse physique de l’école à configurer": "School address to configure",
    "Site internet de l’école à configurer": "School website to configure",
    "APERÇU NON OFFICIEL · IDENTITÉ DE L’ÉCOLE À CONFIGURER": "UNOFFICIAL PREVIEW · SCHOOL IDENTITY TO CONFIGURE",
    "Aucun prérequis indiqué.": "No prerequisites provided.",
    "Répondre lisiblement à toutes les questions.": "Answer all questions clearly.",
    "suite": "continued",
    "point(s)": "point(s)",
    "Créer un devoir": "Create an assignment",
    "Publier le devoir": "Publish assignment",
    "Enregistrer le brouillon": "Save draft",
    "Télécharger le PDF": "Download PDF",
    "Télécharger le rapport PDF": "Download PDF report",
    "Télécharger le reçu PDF": "Download PDF receipt"
  };

  var enToFr = Object.keys(frToEn).reduce(function (reverse, key) {
    reverse[frToEn[key]] = key;
    return reverse;
  }, {});

  function dictionaryFor(language) {
    return language === "en" ? frToEn : enToFr;
  }

  function translateText(value, language) {
    var text = String(value == null ? "" : value);
    var trimmed = text.trim();
    if (!trimmed) return text;
    var translated = dictionaryFor(language || currentLanguage)[trimmed];
    if (!translated) return text;
    return text.replace(trimmed, translated);
  }

  function translateNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || !node.parentElement) return;
    var parent = node.parentElement;
    if (/^(SCRIPT|STYLE|TEXTAREA|CODE)$/i.test(parent.tagName)) return;
    if (parent.hasAttribute("data-no-translate") || parent.closest("[data-no-translate]")) return;
    var current = node.nodeValue;
    var previousRendered = renderedTextNodes.get(node);
    if (!originalTextNodes.has(node) || (previousRendered !== undefined && current !== previousRendered)) {
      originalTextNodes.set(node, current);
    }
    var original = originalTextNodes.get(node);
    if (parent.tagName === "OPTION" && !parent.hasAttribute("value")) parent.value = original.trim();
    var translated = currentLanguage === "en" ? translateText(original, "en") : original;
    renderedTextNodes.set(node, translated);
    if (translated !== current) node.nodeValue = translated;
  }

  function translateAttributes(element) {
    var originals = originalAttributes.get(element) || {};
    var rendered = renderedAttributes.get(element) || {};
    ["aria-label", "title", "placeholder"].forEach(function (attribute) {
      if (!element.hasAttribute || !element.hasAttribute(attribute)) return;
      var value = element.getAttribute(attribute);
      if (!(attribute in originals) || (attribute in rendered && value !== rendered[attribute])) originals[attribute] = value;
      var translated = currentLanguage === "en" ? translateText(originals[attribute], "en") : originals[attribute];
      rendered[attribute] = translated;
      if (translated !== value) element.setAttribute(attribute, translated);
    });
    originalAttributes.set(element, originals);
    renderedAttributes.set(element, rendered);
  }

  function apply(root) {
    root = root || document.body;
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) translateNode(root);
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) translateNode(node);
    if (root.querySelectorAll) root.querySelectorAll("[aria-label], [title], [placeholder]").forEach(translateAttributes);
    document.documentElement.lang = currentLanguage;
    document.querySelectorAll("[data-language]").forEach(function (button) {
      var selected = button.getAttribute("data-language") === currentLanguage;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function setLanguage(language) {
    currentLanguage = language === "en" ? "en" : "fr";
    window.localStorage.setItem(STORAGE_KEY, currentLanguage);
    apply(document.body);
    window.dispatchEvent(new CustomEvent("schoolsafe:language-change", { detail: { language: currentLanguage } }));
    return currentLanguage;
  }

  function localized(content, language) {
    language = language || currentLanguage;
    if (typeof content === "string") return { text: content, fallback: false, language: language };
    content = content || {};
    if (content[language]) return { text: content[language], fallback: false, language: language };
    var fallbackLanguage = language === "en" ? "fr" : "en";
    return { text: content[fallbackLanguage] || "", fallback: true, language: fallbackLanguage };
  }

  function documentLanguage() {
    var value = window.localStorage.getItem(DOCUMENT_KEY);
    return value === "en" || value === "bilingual" ? value : "fr";
  }

  function setDocumentLanguage(value) {
    value = value === "en" || value === "bilingual" ? value : "fr";
    window.localStorage.setItem(DOCUMENT_KEY, value);
    return value;
  }

  function observe() {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === "characterData") translateNode(mutation.target);
        mutation.addedNodes.forEach(function (node) { apply(node); });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  window.SchoolSafeI18n = {
    apply: apply,
    current: function () { return currentLanguage; },
    setLanguage: setLanguage,
    translateText: translateText,
    localized: localized,
    documentLanguage: documentLanguage,
    setDocumentLanguage: setDocumentLanguage
  };

  document.addEventListener("DOMContentLoaded", function () {
    apply(document.body);
    observe();
  }, { once: true });
})();
