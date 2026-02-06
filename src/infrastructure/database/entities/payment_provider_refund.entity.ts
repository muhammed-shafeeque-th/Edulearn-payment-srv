import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { PaymentProviderSessionEntity } from './payment-provider-session.entity';
import { PaymentEntity } from './payment.entity';

@Entity('payment_provider_refunds')
export class PaymentProviderRefundEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  paymentId!: string;

  @ManyToOne(() => PaymentEntity)
  @JoinColumn({ name: 'paymentId' })
  payment!: PaymentEntity;

  @Column()
  providerSessionId!: string;

  @OneToOne(() => PaymentProviderSessionEntity)
  @JoinColumn({ name: 'providerSessionId' })
  providerSession!: PaymentProviderSessionEntity;

  @Column()
  providerRefundId?: string;

  // amount in provider minor units (e.g., cents)
  @Column('bigint')
  requestedAmount!: number;

  @Column()
  requestedCurrency!: string;

  @Column()
  idempotencyKey!: string;

  @Column('float', { nullable: true })
  providerFee?: number;

  @Column()
  status!: string; // PENDING / SUCCESS / FAILED

  @Column('jsonb', { nullable: true })
  metadata?: any;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
