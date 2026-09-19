\set ON_ERROR_STOP on

begin;
set local role schoolsafe_owner;

-- BEGIN CANONICAL SCOPES
insert into iam.scopes (code, label, description) values
  ('none', 'Sans portée', 'Action globale ne ciblant aucune donnée métier.'),
  ('own', 'Données propres', 'Données appartenant au profil actif.'),
  ('own_children', 'Enfants liés', 'Données des élèves liés au profil Parent ou Tuteur.'),
  ('assigned_classes', 'Classes affectées', 'Classes couvertes par une affectation active.'),
  ('assigned_subjects', 'Matières affectées', 'Matières couvertes par une affectation active.'),
  ('assigned_portal', 'Portail affecté', 'Portail de sécurité explicitement affecté.'),
  ('school', 'École', 'Toutes les données de l’école active.')
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  is_active = true,
  updated_at = pg_catalog.now();
-- END CANONICAL SEED

-- BEGIN CANONICAL PERMISSIONS
insert into iam.permissions (code, default_scope_code, label) values
  ('session.bootstrap', 'none', 'Bootstrap initial de l''école'),
  ('school.class.read', 'assigned_classes', 'Lire les classes'),
  ('school.student.read', 'assigned_classes', 'Lire les dossiers élèves'),
  ('school.student.create', 'school', 'Créer un dossier élève en préparation'),
  ('school.guardian.read', 'own_children', 'Lire les tuteurs'),
  ('school.guardian.manage', 'school', 'Gérer les tuteurs'),
  ('school.manage', 'school', 'Gérer l''école'),
  ('school.structure.manage', 'school', 'Gérer la structure académique'),
  ('staff.manage', 'school', 'Gérer le personnel'),
  ('roles.manage', 'school', 'Gérer les rôles et permissions'),
  ('security.pickup.read', 'own_children', 'Lire les autorisations de pick-up'),
  ('security.pickup.manage', 'assigned_portal', 'Gérer les pick-up'),
  ('security.scan', 'assigned_portal', 'Scanner un QR'),
  ('security.lockdown.manage', 'school', 'Gérer le lockdown'),
  ('security.events.read', 'assigned_classes', 'Lire les événements de sécurité'),
  ('security.card.create', 'school', 'Créer une carte'),
  ('pilotage.dashboard.read', 'school', 'Lire le tableau de bord'),
  ('pilotage.alerts.read', 'assigned_classes', 'Lire les alertes'),
  ('pilotage.alerts.manage', 'school', 'Gérer les alertes'),
  ('pilotage.approvals.read', 'own', 'Lire les demandes d''approbation'),
  ('pilotage.approvals.manage', 'school', 'Gérer les approbations'),
  ('email.send', 'school', 'Envoyer des emails'),
  ('finance.fee.read', 'assigned_classes', 'Lire les frais scolaires'),
  ('finance.fee.manage', 'school', 'Gérer les frais scolaires'),
  ('finance.payment.record', 'school', 'Enregistrer un paiement'),
  ('finance.payment.cancel', 'school', 'Annuler un paiement'),
  ('finance.receipt.read', 'own_children', 'Lire les reçus'),
  ('finance.report.read', 'school', 'Lire les rapports financiers'),
  ('finance.cash_register.close', 'school', 'Clôturer la caisse'),
  ('finance.cash_register.open', 'school', 'Ouvrir une caisse'),
  ('finance.control.read', 'school', 'Lire les campagnes de contrôle'),
  ('finance.control.manage', 'school', 'Gérer les campagnes de contrôle'),
  ('finance.control.scan', 'assigned_classes', 'Scanner un contrôle de frais'),
  ('finance.status.read', 'assigned_classes', 'Lire le statut financier'),
  ('pedagogy.subject.read', 'assigned_subjects', 'Lire les matières'),
  ('pedagogy.subject.manage', 'school', 'Gérer les matières'),
  ('pedagogy.assignment.read', 'assigned_classes', 'Lire les devoirs'),
  ('pedagogy.assignment.manage', 'assigned_classes', 'Gérer les devoirs'),
  ('pedagogy.grade.read', 'own_children', 'Lire les notes'),
  ('pedagogy.grade.manage', 'assigned_classes', 'Gérer les notes'),
  ('pedagogy.lesson-plan.read', 'assigned_classes', 'Lire le cahier de préparation'),
  ('pedagogy.lesson-plan.manage', 'assigned_classes', 'Gérer le cahier de préparation'),
  ('pedagogy.report.read', 'school', 'Lire les rapports pédagogiques'),
  ('pedagogy.report.manage', 'school', 'Gérer les rapports pédagogiques'),
  ('palmarques.read', 'school', 'Consulter le palmarès'),
  ('palmarques.manage', 'school', 'Gérer le palmarès'),
  ('staff.read', 'school', 'Consulter le personnel'),
  ('staff.attendance.read', 'school', 'Consulter les présences du personnel'),
  ('canteen.manage', 'school', 'Gérer la cantine'),
  ('infirmary.manage', 'school', 'Gérer l''infirmerie'),
  ('communication.announcement.manage', 'school', 'Gérer les annonces'),
  ('communication.message.send', 'school', 'Envoyer des messages'),
  ('safe.assistant.use', 'own', 'Utiliser l''assistant Safe'),
  ('reports.operational.read', 'school', 'Lire les rapports opérationnels'),
  ('reports.financial.read', 'school', 'Lire les rapports financiers'),
  ('reports.security.read', 'school', 'Lire les rapports de sécurité'),
  ('reports.hr.read', 'school', 'Lire les rapports RH'),
  ('sync.submit', 'own', 'Soumettre une synchronisation'),
  ('file.upload', 'own', 'Téléverser un fichier'),
  ('file.download', 'own', 'Télécharger un fichier'),
  ('cards.request.print', 'school', 'Demander l''impression d''une carte'),
  ('cards.print.read', 'school', 'Consulter les travaux d''impression'),
  ('cards.print.manage', 'school', 'Gérer les travaux d''impression'),
  ('notification.subscribe', 'own', 'S''abonner aux notifications')
on conflict (code) do update set
  default_scope_code = excluded.default_scope_code,
  label = excluded.label,
  is_active = true,
  updated_at = pg_catalog.now();
-- END CANONICAL SEED

do $schoolsafe$
declare
  v_permission_count integer;
  v_scope_count integer;
begin
  select pg_catalog.count(*) into v_permission_count from iam.permissions;
  select pg_catalog.count(*) into v_scope_count from iam.scopes;

  if v_permission_count <> 64 then
    raise check_violation using message = pg_catalog.format('Expected exactly 64 permissions, found %s', v_permission_count);
  end if;
  if v_scope_count <> 7 then
    raise check_violation using message = pg_catalog.format('Expected exactly 7 scopes, found %s', v_scope_count);
  end if;
end
$schoolsafe$;

commit;
