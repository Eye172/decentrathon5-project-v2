"""
Seed database with commission members.
Run manually: python seed_data.py

Also called from main.py on API startup so demo logins always exist.
"""
from database import SessionLocal, engine, Base
from models.db_models import User
from services.auth_service import hash_password

Base.metadata.create_all(bind=engine)

COMMISSION_MEMBERS = [
    {"email": "commission1@invisionu.kz", "password": "commission123"},
    {"email": "commission2@invisionu.kz", "password": "commission123"},
    {"email": "admin@invisionu.kz", "password": "admin123"},
]


def ensure_commission_seeded(*, verbose: bool = True) -> int:
    """Insert default commission users if missing. Returns count of new rows."""
    db = SessionLocal()
    try:
        seeded = 0
        for member in COMMISSION_MEMBERS:
            existing = db.query(User).filter(User.email == member["email"]).first()
            if not existing:
                user = User(
                    email=member["email"],
                    password_hash=hash_password(member["password"]),
                    role="commission",
                )
                db.add(user)
                seeded += 1

        db.commit()
        if verbose:
            print(f"OK: Seeded {seeded} commission members.")
            print("Commission accounts:")
            for m in COMMISSION_MEMBERS:
                print(f"  Email: {m['email']}  Password: {m['password']}")
        return seeded
    finally:
        db.close()


if __name__ == "__main__":
    ensure_commission_seeded(verbose=True)
