import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PaymentProviderSessionEntity } from './payment-provider-session.entity';

@Entity('payments')
@Index('idx_payments_idempotency_key', ['idempotencyKey'])
export class PaymentEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column()
  orderId!: string;

  @Column('bigint')
  amount!: number;

  @Column()
  currency!: string;

  @Column()
  expiresAt!: Date; // expiresAt is stored as a Date

  @Column()
  status!: string;

  @Column({ unique: true })
  idempotencyKey!: string;

  // @Column()
  // paymentGateway!: string;

  @Column({ nullable: true })
  providerOrderId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => PaymentProviderSessionEntity, (session) => session.payment, {
    cascade: true,
  })
  providerSessions!: PaymentProviderSessionEntity[];
}
