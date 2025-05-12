from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from chat.models import UserProfile
import re
from django.core.exceptions import ValidationError

class PasswordStrengthValidator:
    """
    Validates that a password meets the strong password requirements.
    """
    def __init__(self, min_length=8):
        self.min_length = min_length
    
    def validate(self, password, user=None):
        errors = []
        
        # Check length
        if len(password) < self.min_length:
            errors.append(f"Password must be at least {self.min_length} characters long.")
            
        # Check for at least one uppercase letter
        if not re.search(r'[A-Z]', password):
            errors.append("Password must contain at least one uppercase letter.")
            
        # Check for at least one lowercase letter
        if not re.search(r'[a-z]', password):
            errors.append("Password must contain at least one lowercase letter.")
            
        # Check for at least one digit
        if not re.search(r'[0-9]', password):
            errors.append("Password must contain at least one number.")
            
        # Check for at least one special character
        if not re.search(r'[^A-Za-z0-9]', password):
            errors.append("Password must contain at least one special character.")
            
        if errors:
            raise ValidationError(errors)
    
    def get_help_text(self):
        return f"""
        Your password must:
        • Be at least {self.min_length} characters long
        • Contain at least one uppercase letter
        • Contain at least one lowercase letter
        • Contain at least one number
        • Contain at least one special character
        """


class SignUpForm(forms.Form):
    username = forms.CharField(min_length=5, max_length=20, 
                              validators=[
                                  # Username validation to match pattern
                                  lambda u: None if re.match(r'^[A-Za-z0-9@.+_-]+$', u) else \
                                      ValidationError("Username can only contain letters, numbers, and @/./+/-/_ characters")
                              ])
    password1 = forms.CharField(label='Password', widget=forms.PasswordInput)
    password2 = forms.CharField(label="Confirm Password", widget=forms.PasswordInput)
    
    def clean_username(self):
        username = self.cleaned_data.get('username')
        # Check if the username already exists
        if User.objects.filter(username=username).exists():
            raise ValidationError("Username already exists. Please choose a different one.")
        return username
    
    def clean_password1(self):
        password1 = self.cleaned_data.get('password1')
        # Use the password validator
        validator = PasswordStrengthValidator()
        validator.validate(password1)
        return password1
    
    def clean_password2(self):
        password1 = self.cleaned_data.get('password1')
        password2 = self.cleaned_data.get('password2')
        
        # Skip this check if password1 has errors (it will be caught in clean_password1)
        if password1 and password1 != password2:
            raise ValidationError("Passwords don't match.")
        return password2
    
    def save(self, commit=True):
        user = User.objects.create_user(
            username=self.cleaned_data['username'],
            password=self.cleaned_data['password1']
        )
        return user