import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentEntity } from './payment.entity';
import { PaymentProviderRefundEntity } from './payment_provider_refund.entity';

@Entity('payment_provider_sessions')
export class PaymentProviderSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  paymentId!: string;

  @ManyToOne(() => PaymentEntity, (payment) => payment.providerSessions)
  @JoinColumn({ name: 'paymentId' })
  payment!: PaymentEntity;

  @OneToOne(
    () => PaymentProviderRefundEntity,
    (refund) => refund.providerSession,
    { cascade: true },
  )
  refund?: PaymentProviderRefundEntity;

  @Column()
  provider!: string;

  @Column()
  providerAmount!: number;

  @Column()
  providerCurrency!: string;

  @Column('float')
  fxRate!: number;

  @Column()
  fxTimestamp!: Date;

  @Column({ nullable: true })
  providerOrderId?: string;

  @Column({ nullable: true })
  providerPaymentId?: string;

  @Column()
  status!: string;

  @Column('jsonb', { nullable: true })
  metadata?: any;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
