import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('refunds')
@Index('idx_refunds_idempotency_key', ['idempotencyKey'])
export class RefundEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  paymentId!: string;

  @Column()
  userId!: string;

  @Column('bigint')
  amount!: number;

  @Column()
  currency!: string;

  @Column()
  status!: string;

  @Column()
  idempotencyKey!: string;

  @Column()
  reason!: string;

  @Column({ nullable: true })
  transactionId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
