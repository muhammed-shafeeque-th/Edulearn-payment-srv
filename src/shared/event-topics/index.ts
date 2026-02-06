export enum KafkaTopics {
  // ====== AUTH DOMAIN EVENTS ======
  AuthUserCreated = 'auth.user.created.v1',
  AuthUserRegistered = 'auth.user.registered.v1',
  AuthUserLogin = 'auth.user.login.v1',
  AuthOTPRequested = 'auth.otp.requested.v1',
  AuthOTPVerified = 'auth.otp.verified.v1',
  AuthOTPVerificationFailed = 'auth.otp.verification.failed.v1',
  AuthMfaEnabled = 'auth.mfa.enabled.v1',
  AuthMfaDisabled = 'auth.mfa.disabled.v1',
  AuthAccountLocked = 'auth.account.locked.v1',
  AuthAccountUnlocked = 'auth.account.unlocked.v1',
  AuthTokenIssued = 'auth.token.issued.v1',
  AuthTokenRefreshed = 'auth.token.refreshed.v1',
  AuthTokenRevoked = 'auth.token.revoked.v1',

  // ====== USER DOMAIN EVENTS ======
  UserCreated = 'user.created.v1',
  UserUpdated = 'user.updated.v1',
  UserDeleted = 'user.deleted.v1',
  UserProfileCompleted = 'user.profile.completed.v1',
  UserProfileUpdated = 'user.profile.updated.v1',
  UserStatusChanged = 'user.status.changed.v1',
  UserRoleAssigned = 'user.role.assigned.v1',
  UserRoleRevoked = 'user.role.revoked.v1',
  UserInstructorRegistered = 'user.instructor.registered.v1',
  UserInstructorVerified = 'user.instructor.verified.v1',
  UserInstructorRejected = 'user.instructor.rejected.v1',

  // ====== NOTIFICATION DOMAIN EVENTS ======
  NotificationSentEmail = 'notification.sent.email.v1',
  NotificationSentSms = 'notification.sent.sms.v1',
  NotificationSentInApp = 'notification.sent.in-app.v1',
  NotificationSentPush = 'notification.sent.push.v1',
  NotificationDelivered = 'notification.delivered.v1',
  NotificationFailed = 'notification.failed.v1',
  NotificationViewed = 'notification.viewed.v1',
  NotificationDismissed = 'notification.dismissed.v1',

  NotificationRequestEmail = 'notification.request.email.v1',
  NotificationRequestSms = 'notification.request.sms.v1',
  NotificationRequestInApp = 'notification.request.in-app.v1',
  NotificationRequestPush = 'notification.request.push.v1',
  NotificationRequestGeneral = 'notification.request.general.v1',
  NotificationEventGeneral = 'notification.event.general.v1',

  // Auth-specific notification requests
  NotificationRequestAuthOtp = 'notification.request.auth.otp.v1',
  NotificationRequestAuthForgotPassword = 'notification.request.auth.forgot-password.v1',
  NotificationRequestAuthAccountCreated = 'notification.request.auth.account-created.v1',

  // Notification event channels (for multi-channel workflows)
  NotificationEmailChannel = 'notification.channel.email.v1',
  NotificationSmsChannel = 'notification.channel.sms.v1',
  NotificationPushChannel = 'notification.channel.push.v1',
  NotificationInAppChannel = 'notification.channel.in-app.v1',

  // ====== COURSE DOMAIN EVENTS ======
  CourseCreated = 'course.created.v1',
  CourseUpdated = 'course.updated.v1',
  CourseDeleted = 'course.deleted.v1',
  CoursePublished = 'course.published.v1',
  CourseUnpublished = 'course.unpublished.v1',
  CourseArchived = 'course.archived.v1',
  CourseRestored = 'course.restored.v1',
  CourseEnrollmentCreated = 'course.enrollment.created.v1',
  CourseEnrollmentCancelled = 'course.enrollment.cancelled.v1',
  CourseEnrollmentCompleted = 'course.enrollment.completed.v1',
  CourseEnrollmentFailed = 'course.enrollment.failed.v1',
  CourseProgressStarted = 'course.progress.started.v1',
  CourseProgressUpdated = 'course.progress.updated.v1',
  CourseProgressCompleted = 'course.progress.completed.v1',
  CourseReviewSubmitted = 'course.review.submitted.v1',

  // Order - course workflow
  OrderCourseCreated = 'order.course.created.v1',
  OrderCourseUpdated = 'order.course.updated.v1',
  OrderCourseCancelled = 'order.course.cancelled.v1',
  OrderCourseExpired = 'order.course.expired.v1',
  OrderCourseSucceeded = 'order.course.succeeded.v1',
  OrderCourseFailed = 'order.course.failed.v1',
  OrderCourseRefunded = 'order.course.refunded.v1',
  OrderCourseFulfilled = 'order.course.fulfilled.v1',

  // ====== PAYMENT DOMAIN EVENTS ======
  PaymentOrderInitiated = 'payment.order.initiated.v1',
  PaymentOrderSucceeded = 'payment.order.succeeded.v1',
  PaymentOrderFailed = 'payment.order.failed.v1',
  PaymentOrderPending = 'payment.order.pending.v1',
  PaymentOrderCancelled = 'payment.order.cancelled.v1',
  PaymentOrderTimeout = 'payment.order.timeout.v1',
  PaymentOrderRefunded = 'payment.order.refunded.v1',
  PaymentOrderDisputed = 'payment.order.disputed.v1',
  PaymentOrderProcessing = 'payment.order.processing.v1',
  PaymentOrderCompleted = 'payment.order.completed.v1',
  PaymentChargebackInitiated = 'payment.chargeback.initiated.v1',
  PaymentChargebackResolved = 'payment.chargeback.resolved.v1',
  PaymentPayoutInitiated = 'payment.payout.initiated.v1',
  PaymentPayoutCompleted = 'payment.payout.completed.v1',
  PaymentProviderEvents = 'payment.provider-events.v1',

  // ====== SESSION & AUTHENTICATION EVENTS ======
  SessionCreated = 'session.created.v1',
  SessionRefreshed = 'session.refreshed.v1',
  SessionTerminated = 'session.terminated.v1',
  SessionExpired = 'session.expired.v1',
  SessionCancelled = 'session.cancelled.v1',
  SessionExtended = 'session.extended.v1',
  SessionInvalidated = 'session.invalidated.v1',

  // ====== DLQ (DEAD LETTER QUEUES) ======
  DlqUserService = 'dlq.user.service.v1',
  DlqCourseService = 'dlq.course.service.v1',
  DlqOrderService = 'dlq.order.service.v1',
  DlqPaymentService = 'dlq.payment.service.v1',
  DlqNotificationService = 'dlq.notification.service.v1',
  DlqApiGateway = 'dlq.api.gateway.v1',
  DlqSessionService = 'dlq.session.service.v1',
  DlqAuthService = 'dlq.auth.service.v1',

  // ====== MISC/GENERAL ======
  AuditLogEvent = 'audit.log.event.v1',
  HealthCheck = 'internal.healthcheck.v1',
}
